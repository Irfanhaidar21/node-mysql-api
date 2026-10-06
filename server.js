const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============================================================
// FIREBASE ADMIN SETUP (Modular & 100% Working)
// ============================================================

try {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, '\n');

        if (!getApps().length) {
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID.trim(),
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
                    privateKey: privateKey.trim()
                })
            });
        }
        
        console.log('Firebase Admin initialized successfully!');
    } else {
        console.warn('⚠️ Warning: Firebase environment variables are missing.');
    }
} catch (error) {
    console.error('Firebase Admin initialization failed:', error.message);
}
// ============================================================
// MYSQL CONFIG
// ============================================================

const dbConfig = {
    host: process.env.DB_HOST || 'mysql-2c0f57b3-ajson449-5133.i.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASS || 'AVNS_1P4K62qVyHzDs_9tW1P',
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT || 15886,
    ssl: {
        rejectUnauthorized: false
    }
};

// ============================================================
// MYSQL CONNECTION
// ============================================================

const connection = mysql.createConnection(dbConfig);

connection.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }
    console.log('Connected to MySQL successfully!');

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

    connection.query(createTableQuery, (err) => {
        if (err) {
            console.error('Table creation error:', err.message);
            return;
        }
        console.log('Messages table ready!');
    });
});


// ============================================================
// GET ALL MESSAGES
// ============================================================

app.get('/api/messages', (req, res) => {
    connection.query('SELECT * FROM messages ORDER BY id DESC', (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, data: results });
    });
});


// ============================================================
// GET SINGLE MESSAGE
// ============================================================

app.get('/api/messages/:id', (req, res) => {
    const { id } = req.params;
    connection.query('SELECT * FROM messages WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, data: results[0] });
    });
});


// ============================================================
// POST NEW MESSAGE
// ============================================================

app.post('/api/messages', (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({
            success: false,
            message: 'name, email, subject and message are required'
        });
    }

    const query = `
        INSERT INTO messages (name, email, subject, message)
        VALUES (?, ?, ?, ?)
    `;

    connection.query(query, [name, email, subject, message], async (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }

        const insertedId = results.insertId;

        // ==================================================
        // SEND FCM NOTIFICATION (If Configured)
        // ==================================================
        if (!messaging) {
            return res.status(201).json({
                success: true,
                message: 'Record created successfully (Notifications not configured)',
                insertedId: insertedId,
                notificationSent: false
            });
        }

        try {
            const fcmMessage = {
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
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'new_messages_channel',
                        sound: 'default',
                        priority: 'high'
                    }
                }
            };

            const firebaseResponse = await messaging.send(fcmMessage);
            console.log('FCM notification sent:', firebaseResponse);

            return res.status(201).json({
                success: true,
                message: 'Record created and notification sent',
                insertedId: insertedId,
                notificationSent: true
            });

        } catch (fcmError) {
            console.error('FCM notification failed:', fcmError.message);
            return res.status(201).json({
                success: true,
                message: 'Record created but notification failed',
                insertedId: insertedId,
                notificationSent: false,
                notificationError: fcmError.message
            });
        }
    });
});


// ============================================================
// UPDATE MESSAGE
// ============================================================

app.put('/api/messages/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, subject, message } = req.body;

    const query = `
        UPDATE messages
        SET name = ?, email = ?, subject = ?, message = ?
        WHERE id = ?
    `;

    connection.query(query, [name, email, subject, message, id], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, message: 'Record updated successfully' });
    });
});


// ============================================================
// DELETE MESSAGE
// ============================================================

app.delete('/api/messages/:id', (req, res) => {
    const { id } = req.params;

    connection.query('DELETE FROM messages WHERE id = ?', [id], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, message: 'Record deleted successfully' });
    });
});


// ============================================================
// SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
