const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ============================================================
// FIREBASE ADMIN SETUP (ENV VARIABLE THI)
// ============================================================

let messaging = null;

function loadServiceAccount() {
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env variable missing');

    raw = raw.trim();

    // jo base64 ma muko to pan chale
    if (!raw.startsWith('{')) {
        raw = Buffer.from(raw, 'base64').toString('utf8');
    }

    const sa = JSON.parse(raw);

    if (!sa.private_key || !sa.client_email || !sa.project_id) {
        throw new Error('Service account JSON ma private_key / client_email / project_id nathi');
    }

    // Render ma \n literal text bani jay to real newline banavo
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    return sa;
}

try {
    const serviceAccount = loadServiceAccount();

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    messaging = admin.messaging();
    console.log('Firebase Admin initialized successfully! 🔥');
} catch (error) {
    console.error('Firebase initialization error:', error.message);
}

// ============================================================
// MYSQL CONFIG (POOL - connection lost thay to auto reconnect)
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

const createTableQuery = `
    CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`;

pool.query(createTableQuery, (err) => {
    if (err) {
        console.error('Database/Table error:', err.message);
        return;
    }
    console.log('Connected to MySQL & Messages table ready!');
});

// ============================================================
// API ROUTES
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

    const query = `INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)`;

    pool.query(query, [name, email, subject, message], async (err, results) => {
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
                message: 'Record created and notification sent',
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
    });
});

app.put('/api/messages/:id', (req, res) => {
    const { name, email, subject, message } = req.body;

    const query = `UPDATE messages SET name = ?, email = ?, subject = ?, message = ? WHERE id = ?`;

    pool.query(query, [name, email, subject, message, req.params.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, message: 'Record updated successfully' });
    });
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

// ============================================================
// SERVER LISTEN
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running successfully on port ${PORT}`);
});
