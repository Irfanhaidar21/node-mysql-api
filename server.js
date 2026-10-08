const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Flutter app ma banavelo channel id (same hovo j joiye)
const ANDROID_CHANNEL_ID = 'new_messages_channel';

// ============================================================
// STARTUP CHECK (value nahi, fakt set che ke nai e batave)
// ============================================================
console.log('ENV check:', {
    DB_HOST: !!process.env.DB_HOST,
    DB_USER: !!process.env.DB_USER,
    DB_PASS: !!process.env.DB_PASS,
    DB_NAME: !!process.env.DB_NAME,
    DB_PORT: !!process.env.DB_PORT,
    FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    SECRET_FILE: fs.existsSync('/etc/secrets/firebase.json')
});

// ============================================================
// FIREBASE ADMIN SETUP
// ============================================================
let messaging = null;

function loadServiceAccount() {
    let sa;
    const secretPath = '/etc/secrets/firebase.json';

    if (fs.existsSync(secretPath)) {
        console.log('Firebase: secret file vapraay che');
        sa = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
    } else {
        let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (!raw) {
            throw new Error('Secret file ane FIREBASE_SERVICE_ACCOUNT banne nathi');
        }
        console.log('Firebase: env variable vapraay che');
        raw = raw.trim();

        // aaju baaju quotes hoy to kadhi nakho
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            raw = raw.slice(1, -1);
        }
        // base64 hoy to decode karo
        if (!raw.startsWith('{')) {
            raw = Buffer.from(raw, 'base64').toString('utf8');
        }
        sa = JSON.parse(raw);
    }

    if (!sa.private_key || !sa.client_email || !sa.project_id) {
        throw new Error('JSON ma private_key / client_email / project_id nathi');
    }

    sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');

    if (!sa.private_key.includes('BEGIN PRIVATE KEY')) {
        throw new Error('private_key format khotu che');
    }
    return sa;
}

try {
    const serviceAccount = loadServiceAccount();

    if (!getApps().length) {
        initializeApp({
            credential: cert(serviceAccount)
        });
    }

    messaging = getMessaging();
    console.log('Firebase Admin initialized successfully! 🔥');
} catch (error) {
    console.error('Firebase initialization error:', error.message);
    console.error(error.stack);
}

// ============================================================
// MYSQL POOL
// ============================================================
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'defaultdb',
    port: Number(process.env.DB_PORT) || 3306,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true
});

pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error('Database/Table error:', err.code, err.message || '');
        if (err.errors) err.errors.forEach(e => console.error(' -', e.code, e.address, e.port));
        return;
    }
    console.log('Connected to MySQL & Messages table ready!');
});

// ============================================================
// ROUTES
// ============================================================
app.get('/', (req, res) => {
    res.json({ success: true, message: 'API running', firebase: !!messaging });
});

app.get('/api/messages', (req, res) => {
    pool.query('SELECT * FROM messages ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: results });
    });
});

app.get('/api/messages/:id', (req, res) => {
    pool.query('SELECT * FROM messages WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, data: results[0] });
    });
});

app.post('/api/messages', (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({
            success: false,
            message: 'name, email, subject and message are required'
        });
    }

    pool.query(
        'INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
        [name, email, subject, message],
        async (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            const insertedId = results.insertId;

            if (!messaging) {
                return res.status(201).json({
                    success: true,
                    message: 'Record created, but notification skipped (Firebase offline)',
                    insertedId,
                    notificationSent: false
                });
            }

            try {
                await messaging.send({
                    topic: 'new_messages',

                    notification: {
                        title: 'New Message Received',
                        body: `${name}: ${subject}`
                    },

                    // WhatsApp jevi heads-up (pop-up) notification mate
                    android: {
                        priority: 'high',
                        ttl: 3600 * 1000,
                        notification: {
                            channelId: ANDROID_CHANNEL_ID,
                            priority: 'high',
                            defaultSound: true,
                            defaultVibrateTimings: true,
                            visibility: 'public',
                            notificationCount: 1
                        }
                    },

                    data: {
                        type: 'new_message',
                        messageId: String(insertedId),
                        name: String(name),
                        email: String(email),
                        subject: String(subject)
                    }
                });

                return res.status(201).json({
                    success: true,
                    message: 'Thank you! Your message has been sent successfully. I will get back to you soon',
                    insertedId,
                    notificationSent: true
                });
            } catch (fcmError) {
                console.error('FCM error:', fcmError.message);
                return res.status(201).json({
                    success: true,
                    message: 'Record created but notification failed',
                    insertedId,
                    notificationSent: false,
                    notificationError: fcmError.message
                });
            }
        }
    );
});

app.put('/api/messages/:id', (req, res) => {
    const { name, email, subject, message } = req.body;

    pool.query(
        'UPDATE messages SET name = ?, email = ?, subject = ?, message = ? WHERE id = ?',
        [name, email, subject, message, req.params.id],
        (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (results.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Record not found' });
            }
            res.json({ success: true, message: 'Record updated successfully' });
        }
    );
});

app.delete('/api/messages/:id', (req, res) => {
    pool.query('DELETE FROM messages WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, message: 'Record deleted successfully' });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running successfully on port ${PORT}`);
});
