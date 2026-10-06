const express = require('express');
const cors = require('cors'); // 1. CORS require karyu
const mysql = require('mysql2');

const app = express();

// 2. CORS middleware enable karyu jethi frontend thi API call thaye tyare error na aave
app.use(cors());
app.use(express.json());

// Render mate dynamic port ane local mate 3000
const PORT = process.env.PORT || 3000;

// Aiven Cloud Database Connection Configuration (Environment variables thi values lese)
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

const connection = mysql.createConnection(dbConfig);

// Database ane Table Automatic Setup karva mate
connection.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
    console.log('Connected to MySQL Server successfully!');

    // 1. Create Database if not exists
    connection.query('CREATE DATABASE IF NOT EXISTS node_crud_db', (err) => {
        if (err) throw err;
        
        // 2. Connect to the specific database
        connection.changeUser({ database: 'node_crud_db' }, (err) => {
            if (err) throw err;
            
            // 3. Create Table if not exists
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
                if (err) throw err;
                
                // 4. Check if Table is empty, then insert Demo Data
                connection.query('SELECT COUNT(*) as count FROM messages', (err, results) => {
                    if (err) throw err;
                    if (results[0].count === 0) {
                        const demoQuery = `
                            INSERT INTO messages (id, name, email, subject, message, created_at) 
                            VALUES (13, 'Zbhdjdj', 'bsbdh@gmail.com', 'Jdhdhdbhd', 'Ndbbfbfb', '2026-10-02 22:13:39')
                        `;
                        connection.query(demoQuery, (err) => {
                            if (err) throw err;
                            console.log('Demo data inserted successfully!');
                        });
                    }
                });
            });
        });
    });
});

// ==================== CRUD API ENDPOINTS ====================

// 1. GET: All Records Read karva mate
app.get('/api/messages', (req, res) => {
    connection.query('SELECT * FROM messages', (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: results });
    });
});

// 2. GET: Single Record by ID
app.get('/api/messages/:id', (req, res) => {
    const { id } = req.params;
    connection.query('SELECT * FROM messages WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.length === 0) return res.status(404).json({ success: false, message: 'Record not found' });
        res.json({ success: true, data: results[0] });
    });
});

// 3. POST: Navu Record Add karva mate
app.post('/api/messages', (req, res) => {
    const { name, email, subject, message } = req.body;
    const query = 'INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)';
    connection.query(query, [name, email, subject, message], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ 
            success: true, 
            message: 'Record created successfully', 
            insertedId: results.insertId 
        });
    });
});

// 4. PUT: Existing Record Update karva mate
app.put('/api/messages/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, subject, message } = req.body;
    const query = 'UPDATE messages SET name = ?, email = ?, subject = ?, message = ? WHERE id = ?';
    connection.query(query, [name, email, subject, message, id], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.affectedRows === 0) return res.status(404).json({ success: false, message: 'Record not found' });
        res.json({ success: true, message: 'Record updated successfully' });
    });
});

// 5. DELETE: Record Delete karva mate
app.delete('/api/messages/:id', (req, res) => {
    const { id } = req.params;
    connection.query('DELETE FROM messages WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (results.affectedRows === 0) return res.status(404).json({ success: false, message: 'Record not found' });
        res.json({ success: true, message: 'Record deleted successfully' });
    });
});

// Server Start
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
