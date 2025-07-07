const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// DB Connection
const db = mysql.createConnection({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  port: 3306,
  ssl: { rejectUnauthorized: false }
});

// JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// GET all products for a store
router.get('/', authenticateToken, (req, res) => {
  const { store_id } = req.user;
  const query = `
    SELECT p.*, IFNULL(SUM(oi.quantity), 0) AS total_sold
    FROM products p
    LEFT JOIN order_items oi ON p.product_id = oi.product_id AND oi.store_id = ?
    WHERE p.store_id = ?
    GROUP BY p.product_id
  `;

  db.query(query, [store_id, store_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

// POST Add Product (no image)
router.post('/add', authenticateToken, (req, res) => {
  const { product_name, price, product_category, description, stock_quantity } = req.body;
  const { store_id } = req.user;

  const query = `
    INSERT INTO products
    (product_name, price, product_category, description, stock_quantity, image_url, store_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [product_name, price, product_category, description, stock_quantity, null, store_id];

  db.query(query, values, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to insert product' });
    res.status(201).json({ message: 'Product added successfully' });
  });
});

module.exports = router;
