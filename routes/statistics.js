const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
require('dotenv').config();

// ✅ MySQL Connection for Render/CleverCloud
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

// ✅ GET /api/statistics?storeId=201 — Total stats
router.get('/', (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' });
  }

  const query = `
    SELECT 
      COUNT(*) AS total_orders,
      COALESCE(SUM(total_sale_amount), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN sale_type = 'online' THEN total_sale_amount ELSE 0 END), 0) AS online_sales,
      COALESCE(SUM(CASE WHEN sale_type = 'offline' THEN total_sale_amount ELSE 0 END), 0) AS offline_sales
    FROM sales
    WHERE store_id = ?
  `;

  db.query(query, [storeId], (err, results) => {
    if (err) {
      console.error('🔴 Error fetching stats:', err.message);
      return res.status(500).json({ error: 'Database error while fetching statistics' });
    }
    res.json(results[0]);
  });
});

// ✅ GET /api/statistics/by-date?storeId=201 — Daily sales split by type
router.get('/by-date', (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' });
  }

  const query = `
    SELECT 
      DATE_FORMAT(sale_date, '%Y-%m-%d') AS date,
      sale_type,
      SUM(total_sale_amount) AS total
    FROM sales
    WHERE store_id = ?
    GROUP BY date, sale_type
    ORDER BY date
  `;

  db.query(query, [storeId], (err, results) => {
    if (err) {
      console.error('🔴 Error fetching sales by date:', err.message);
      return res.status(500).json({ error: 'Database error while fetching sales by date' });
    }

    const online = {};
    const offline = {};

    results.forEach(row => {
      const date = row.date;
      const amount = Number(row.total);
      if (row.sale_type === 'online') online[date] = amount;
      if (row.sale_type === 'offline') offline[date] = amount;
    });

    res.json({ online, offline });
  });
});

module.exports = router;
