const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

// ✅ MySQL pool for serverless compatibility
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

// ✅ JWT Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ message: 'Token missing' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// ✅ GET /api/feedback — Fetch feedback for the logged-in shop owner's store
router.get('/', authenticateToken, async (req, res) => {
  const { store_id, user_type } = req.user;

  if (user_type !== 'shop_owner') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const sql = `
    SELECT 
      f.feedback_id, 
      f.review_date, 
      f.rating, 
      f.review_description, 
      c.customer_name, 
      p.product_name
    FROM feedback f
    JOIN customers c ON f.customer_id = c.customer_id
    JOIN products p ON f.product_id = p.product_id
    WHERE f.store_id = ?
    ORDER BY f.review_date DESC
  `;

  try {
    const [results] = await pool.query(sql, [store_id]);
    res.json(results);
  } catch (err) {
    console.error('❌ Error fetching feedback:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
