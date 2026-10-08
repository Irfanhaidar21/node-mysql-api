const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const admin = require('firebase-admin');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============================================================
// FIREBASE ADMIN SETUP (DIRECT CONFIGURATION)
// ============================================================

let messaging = null;

try {
    // તમારી ઓરિજિનલ JSON વિગતો ડાયરેક્ટ અહીં સેટ કરી દીધી છે
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: "my-messages-notification",
            clientEmail: "firebase-adminsdk-fbsvc@my-messages-notification.iam.gserviceaccount.com",
            privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCjOpjtPB9lwHil\nbaaPua0pMu2fwXaFTrL661t5pEDXdLLjrrRYeAOf9pkv8mKrA8OWMqZ78DdNVh4q\n3yxY3sGtUPDNYLDtl+OUqvKAc2vT+66t/Netzn2toDVZ2nc1c4K7A4pcsowuJ0Xe\n+ubKYKSZb4zkbAuguBDrcosl47qGkLs4itydyUVonbutotUY9zdHwdL8SN2kD0UD\n8zJEFr23ac/W+XKrUL1dSlQR5ChWAYtBNZ13AZHIHtMVDbQSUaWekcNgxXx72TGD\ncHPiut+jBUy8tCqZBGmdm1JWz8tl4HMTM1XOAts10manHLW1gnDHhFFa/BxdAjNa\nEOKMr5BBAgMBAAECggEAQTdRz4NUhhp6+ZmQUV9dtJbBAzHQUV3Ku98aOsUqFQtu\nx/JO4wP8asajmNkOnAZSeGm/Q8iLx+3u+rEVLmK93in3NA98UUl857LPVgwHmng1\n6BUb9TkJ1LusZTyYoXYH1wGIoBXEVVJio776RASN7zH3CHK0yJ+SPwgSWW6d4VJB\n6kMsoAdD78SR/u83y9+eWVfn2sOHFMt99JrZG6GQ6XuXjDgeeFIkQNICZVqeDzAM\nB25bREvuhgMJgvhe8UeTgrCV9I4g1ltd3d2whbF1J/uW636GP+iMhJ4AdIK5j6uS\nXCjc5ElDnAtBSJknTxP17EsODyzldYbnqMUH4yZn4wKBgQDMrwlyn1S55fG/fhaE\nwzGWQ5L0QZV11P0EyLgHzKFVJ1U6ANM3dzJOdEhpsWrkIEUYnMlI5+CdqelmNLzx\nH7WSneVqJvGmgCsVg/FiUZZIvjRs3Y6wND9iWSgS74Ku/VXb1CGrrcn3hUebLFVL\nVpgV8TQY0CdbX9hIe8b1+bJ7jwKBgQDMJupnLmCPw1SZApPl+Px/u080bQzGyr/O\nSDdy2WVSAd9NM6memEpnUGJxxZmC14LrTXW5TqniTOWoBpF5j84taDfXmB+pJF+7\nTa5B4AqtdE1oOkB4Kkl0nnb7UCNlzHuw0fU/czN6nte3HvOCemAy/ouF+h2b7QiM\nKLKtBLqPLwKBgEF/0dooOoiymMXap4IcpIWdYi1fv2BRpBYf1SRJy2bgi1lgYjbh\noeuRMosAB2CxIutZYOA/s5VAhjv6rGvM5eHhPUTW6YWKhj8AVgJMcXcdxtD/pWWl\nkpL6TOSiWIN+9ja+j3fMyVC4Cc4SRckyEMEUysMV+UI4TZIEagrUuNTpAoGBAIAv\nVzMeXacnILFKew8FPZX+SIdEiacwmyqtEZPdiM7rOgjBjZl1ShKA2K9TQUZ0h1Gz\nu111VRow6mqMZT+M2gqMy7NlY0vS+QEkj2vxfwLWadwt51kMRD8jWNYHxZIfyPKH\ngpQqg4JUxmHG32Nn74tVZMnk+D51oM5Qp5AXzgQlAoGABh7bfP4sMwUQbuJe/7uj\nBX7eTzNSlbieqC8SmQ0mbear1VnwdmJlptOQ3s5dfxBBOUkTfSJouQGTIKCme1Jp\nBg5zc7Fsf9wgiJOfJcHvvX2IVkXneCDwjcoTVwbYcLo0vrpn1huaQFdr5CUHmnHP\naL599tr9QtGrg+gf43BI7oY=\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n'),
        })
    });

    console.log('Firebase Admin initialized successfully! 🎉');
    
    // ટાઇપએરર અટકાવવા માટે સેફ મોડ્યુલ લોડિંગ
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

        // જો Firebase બરાબર ચાલુ ન થયું હોય તો નોટિફિકેશન સ્કીપ થશે
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
