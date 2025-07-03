const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// DB Connection using .env variables
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

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// Middleware to verify JWT and attach user info
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ message: 'Token missing' });

  jwt.verify(token, 'your-secret-key', (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = decoded; // contains user_id, store_id, user_type
    next();
  });
}

// ✅ GET /api/products - Fetch products for the logged-in user's store
router.get('/', authenticateToken, (req, res) => {
  const { store_id } = req.user;

  const query = `
    SELECT 
      p.*, 
      IFNULL(SUM(oi.quantity), 0) AS total_sold
    FROM 
      products p
    LEFT JOIN 
      order_items oi 
      ON p.product_id = oi.product_id AND oi.store_id = ?
    WHERE 
      p.store_id = ?
    GROUP BY 
      p.product_id
  `;

  db.query(query, [store_id, store_id], (err, results) => {
    if (err) {
      console.error('Error fetching products with total_sold:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

// ✅ GET /api/products/categories - Fetch unique categories
router.get('/categories', authenticateToken, (req, res) => {
  const { store_id } = req.user;
  const query = `SELECT DISTINCT product_category AS name FROM products WHERE store_id = ?`;

  db.query(query, [store_id], (err, results) => {
    if (err) {
      console.error('Error fetching categories:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

// ✅ GET /api/products/category-counts - Category count by store
router.get('/category-counts', authenticateToken, (req, res) => {
  const { store_id } = req.user;

  const query = `
    SELECT product_category AS name, COUNT(product_id) AS count
    FROM products
    WHERE store_id = ?
    GROUP BY product_category
  `;

  db.query(query, [store_id], (err, results) => {
    if (err) {
      console.error('Error fetching category counts:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

// ✅ POST /api/products/add - Add new product
router.post('/add', authenticateToken, upload.single('image'), (req, res) => {
  const { product_name, price, product_category, description, stock_quantity } = req.body;
  const { store_id } = req.user;

  const image_url = req.file ? `uploads/${req.file.filename}` : null;

  const query = `
    INSERT INTO products
    (product_name, price, product_category, description, stock_quantity, image_url, store_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    product_name,
    price,
    product_category,
    description,
    stock_quantity,
    image_url,
    store_id
  ];

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error inserting product:', err);
      return res.status(500).json({ error: 'Failed to insert product' });
    }
    res.status(201).json({ message: 'Product added successfully' });
  });
});

// ✅ GET /api/products/filter - Filter and search products
router.get('/filter', authenticateToken, (req, res) => {
  const { store_id } = req.user;
  const { category, minPrice, maxPrice, inStock, search, startDate, endDate, minSold, maxSold } = req.query;

  let query = `
    SELECT 
      p.*, 
      IFNULL(SUM(oi.quantity), 0) AS total_sold
    FROM 
      products p
    LEFT JOIN 
      order_items oi 
      ON p.product_id = oi.product_id AND oi.store_id = ?
    WHERE 
      p.store_id = ?
  `;

  let params = [store_id, store_id];

  if (category && category !== 'All') {
    query += ` AND p.product_category = ?`;
    params.push(category);
  }

  if (minPrice) {
    query += ` AND p.price >= ?`;
    params.push(Number(minPrice));
  }

  if (maxPrice) {
    query += ` AND p.price <= ?`;
    params.push(Number(maxPrice));
  }

  if (inStock === 'true') {
    query += ` AND p.stock_quantity > 0`;
  }

  if (search) {
    query += ` AND p.product_name LIKE ?`;
    params.push(`%${search}%`);
  }

  if (startDate && endDate) {
    query += ` AND DATE(p.date_created) BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  }

  query += ` GROUP BY p.product_id`;

  if (minSold || maxSold) {
    query += ` HAVING 1`;
    if (minSold) {
      query += ` AND total_sold >= ?`;
      params.push(Number(minSold));
    }
    if (maxSold) {
      query += ` AND total_sold <= ?`;
      params.push(Number(maxSold));
    }
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('❌ Error filtering products:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

module.exports = router;
