const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');

// MySQL connection
require('dotenv').config();


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

// Middleware to verify JWT and attach user info
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ message: 'Token missing' });

  jwt.verify(token, 'your-secret-key', (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    console.log('✅ Decoded token:', decoded);  // <-- Add this temporarily

    req.user = decoded; // contains user_id, store_id, user_type
    next();
  });
}

// GET /api/feedback - fetch feedback only for the logged-in shop owner's store
router.get('/', authenticateToken, (req, res) => {
  const { store_id, user_type } = req.user;

  // Optional: Only allow shop_owner to access
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

  db.query(sql, [store_id], (err, results) => {
    if (err) {
      console.error('Error fetching feedback:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json(results);
  });
});

module.exports = router;