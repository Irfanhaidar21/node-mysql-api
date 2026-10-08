const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const admin = require('firebase-admin');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============================================================
// FIREBASE ADMIN SETUP (FLEXIBLE CONFIGURATION)
// ============================================================

let messaging = null;

try {
    // પહેલા ચેક કરીએ કે ડેશબોર્ડ પર સિક્રેટ ફાઇલ મોજૂદ છે કે નહીં
    const fs = require('fs');
    const path = require('path');
    const secretPath = path.join(__dirname, 'firebase-service-account.json');

    if (fs.existsSync(secretPath)) {
        admin.initializeApp({
            credential: admin.credential.cert(require(secretPath))
        });
        console.log('Firebase Admin initialized successfully using Secret File! 🎉');
    } else if (process.env.FIREBASE_PRIVATE_KEY) {
        // જો સિક્રેટ ફાઇલ ન મળે તો પર્યાવરણ વેરિએબલ્સ બેકઅપ તરીકે કામ કરશે
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
        console.log('Firebase Admin initialized successfully using Env Variables! 🚀');
    } else {
        throw new Error('No Firebase configuration found (File or Env Variables).');
    }

    // ટાઇપએરર અટકાવવા માટે સેફ મેસેજિંગ ઇનિશિયલાઇઝેશન
    messaging = admin.messaging ? admin.messaging() : admin.getMessaging();

} catch (error) {
    console.error('Firebase Admin initialization failed:', error.message);
}


// ============================================================
// MYSQL CONFIG
// ============================================================

const dbConfig = {
    host: process.env.DB_HOST || '://aivencloud.com',
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
        res.json({ success: true, data: results });
    });
});


// ============================================================
// POST NEW MESSAGE & SEND FCM NOTIFICATION
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

        // જો Firebase ઇનિશિયલાઇઝ ન થયું હોય તો નોટિફિકેશન સ્કીપ થશે
        if (!messaging) {
            console.error('FCM skipped: Messaging system is not initialized.');
            return res.status(201).json({
                success: true,
                message: 'Message saved, but Firebase messaging was offline.',
                data: { id: insertedId }
            });
        }

        // ==================================================
        // SEND FCM NOTIFICATION
        // ==================================================
        try {
            const fcmMessage = {
                topic: 'new_messages',
                notification: {
                    title: 'New Message Received',
                    body: `${name}: ${subject}`
                },
                data: {
                    type: 'new_message',
                    messageId: String(insertedId)
                }
            };

            const response = await messaging.send(fcmMessage);
            console.log('Successfully sent FCM message:', response);

            return res.status(201).json({
                success: true,
                message: 'Message saved and notification sent successfully',
                data: { id: insertedId }
            });

        } catch (fcmError) {
            console.error('FCM Notification sending failed:', fcmError.message);
            return res.status(201).json({
                success: true,
                message: 'Message saved, but notification failed to send',
                data: { id: insertedId },
                fcmError: fcmError.message
            });
        }
    });
});

// SERVER START
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
