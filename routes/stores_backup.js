const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ✅ MySQL connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

// ✅ Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ✅ Multer setup
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ✅ JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  jwt.verify(token, 'your-secret-key', (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// ✅ POST /api/stores_backup — Create store
router.post(
  '/',
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner_image', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        store_name, slug, description, store_email, store_address,
        facebook, instagram, theme, primary_color,
        currency, timezone, business_type, password
      } = req.body;

      if (!store_name || !store_email || !store_address || !password) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const [userRows] = await pool.query(
        'SELECT user_id FROM users WHERE email = ?',
        [store_email]
      );

      if (userRows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user_id = userRows[0].user_id;
      const logo = req.files?.logo?.[0] ? `/uploads/${req.files.logo[0].filename}` : null;
      const banner_image = req.files?.banner_image?.[0] ? `/uploads/${req.files.banner_image[0].filename}` : null;

      const [result] = await pool.query(`
        INSERT INTO stores_backup (
          store_name, store_email, store_address,
          slug, description, facebook, instagram,
          theme, primary_color, logo, banner_image,
          currency, timezone, business_type,
          password, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        store_name, store_email, store_address,
        slug, description, facebook, instagram,
        theme, primary_color, logo, banner_image,
        currency, timezone, business_type,
        password // ✅ plain-text password
      ]);

      const store_id = result.insertId;

      await pool.query(
        'UPDATE users SET store_id = ? WHERE email = ?',
        [store_id, store_email]
      );

      res.status(201).json({ message: '✅ Store created and user updated', store_id });

    } catch (err) {
      console.error('❌ Store creation error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ✅ GET /api/stores_backup — Store info of logged-in user
router.get('/', authenticateToken, async (req, res) => {
  const { store_id } = req.user;

  if (!store_id) {
    return res.status(400).json({ error: 'Missing store_id in token' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM stores_backup WHERE store_id = ?',
      [store_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error('❌ Error fetching store:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ GET /api/stores_backup/:id — Public store + products
router.get('/:id', async (req, res) => {
  try {
    const storeId = req.params.id;

    const [storeRows] = await pool.query(
      'SELECT * FROM stores_backup WHERE store_id = ?',
      [storeId]
    );

    if (storeRows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const [productRows] = await pool.query(
      'SELECT * FROM products WHERE store_id = ?',
      [storeId]
    );

    res.json({
      store: storeRows[0],
      products: productRows
    });

  } catch (err) {
    console.error('❌ Error fetching store and products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
