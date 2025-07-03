const express = require('express');
const router = express.Router();
require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  port: 3306,
  ssl: {
    rejectUnauthorized: false
  }
});

router.get('/', (req, res) => {
  db.query('SELECT customer_id, customer_name FROM customers', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

module.exports = router;