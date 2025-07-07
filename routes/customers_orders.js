const express = require('express');
const router = express.Router();
require('dotenv').config();
const mysql = require('mysql2/promise');

// ✅ Create a MySQL pool (better for serverless environments like Vercel)
const pool = mysql.createPool({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  port: 3306,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ✅ GET /api/customers — fetch customer_id and customer_name
router.get('/', async (req, res) => {
  try {
    const [results] = await pool.query('SELECT customer_id, customer_name FROM customers');
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
