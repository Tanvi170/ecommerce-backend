const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
require('dotenv').config();

// ✅ MySQL pool for serverless
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

// ✅ GET all orders for a store
router.get('/', async (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId is required in query' });

  const sql = `
    SELECT o.order_id, o.date_ordered, o.total_amount, o.status, c.customer_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    WHERE c.store_id = ?
    ORDER BY o.date_ordered DESC
  `;

  try {
    const [results] = await pool.query(sql, [storeId]);
    res.json(results);
  } catch (err) {
    console.error('🔴 Error fetching orders:', err.message);
    res.status(500).json({ error: 'Database error while fetching orders' });
  }
});

// ✅ POST new order
router.post('/', async (req, res) => {
  const { customer_id, total_amount, status, items, store_id } = req.body;

  if (!customer_id || !total_amount || !status || !store_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields (customer_id, total_amount, status, store_id, items)' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      `INSERT INTO orders (date_ordered, total_amount, customer_id, status) VALUES (NOW(), ?, ?, ?)`,
      [total_amount, customer_id, status]
    );

    const orderId = orderResult.insertId;

    const itemValues = items.map(item => [orderId, item.product_id, item.quantity, store_id]);
    await conn.query(`INSERT INTO order_items (order_id, product_id, quantity, store_id) VALUES ?`, [itemValues]);

    await conn.commit();
    res.status(201).json({ message: '✅ Order and items saved successfully', orderId });

  } catch (err) {
    await conn.rollback();
    console.error('🔴 Error inserting order:', err.message);
    res.status(500).json({ error: 'Database error while inserting order' });
  } finally {
    conn.release();
  }
});

// ✅ PUT update order status and insert into sales if Delivered
router.put('/:orderId/status', async (req, res) => {
  const { orderId } = req.params;
  const { status, storeId } = req.body;

  if (!status || !storeId) {
    return res.status(400).json({ error: 'Both status and storeId are required in body' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [updateResult] = await conn.query(
      `UPDATE orders o
       JOIN customers c ON o.customer_id = c.customer_id
       SET o.status = ?
       WHERE o.order_id = ? AND c.store_id = ?`,
      [status, orderId, storeId]
    );

    if (updateResult.affectedRows === 0) {
      await conn.rollback();
      return res.status(403).json({ error: 'Unauthorized: Order not found for this store' });
    }

    if (status !== 'Delivered') {
      await conn.commit();
      return res.json({ message: '✅ Order status updated successfully' });
    }

    // Insert into sales if Delivered
    const [items] = await conn.query(
      `SELECT oi.product_id, oi.quantity, p.price,
              o.customer_id, o.date_ordered
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.order_id
       JOIN customers c ON o.customer_id = c.customer_id
       JOIN products p ON oi.product_id = p.product_id
       WHERE oi.order_id = ? AND c.store_id = ?`,
      [orderId, storeId]
    );

    if (items.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'No order items found for this order' });
    }

    const salesValues = items.map(item => [
      item.date_ordered,
      'online',
      item.product_id,
      item.quantity,
      item.price,
      item.price * item.quantity,
      storeId,
      item.customer_id
    ]);

    await conn.query(
      `INSERT INTO sales (
         sale_date, sale_type, product_id,
         quantity_sold, unit_price_at_sale,
         total_sale_amount, store_id, customer_id
       ) VALUES ?`, [salesValues]
    );

    await conn.commit();
    res.json({ message: '✅ Order marked as Delivered and sales recorded' });

  } catch (err) {
    await conn.rollback();
    console.error('🔴 Error updating status or inserting sales:', err.message);
    res.status(500).json({ error: 'Internal server error during status update' });
  } finally {
    conn.release();
  }
});

// ✅ GET products for a store
router.get('/products', async (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId is required in query' });

  try {
    const [results] = await pool.query(`SELECT * FROM products WHERE store_id = ?`, [storeId]);
    res.json(results);
  } catch (err) {
    console.error('🔴 Error fetching products:', err.message);
    res.status(500).json({ error: 'Database error while fetching products' });
  }
});

// ✅ GET customers for a store
router.get('/customers_orders', async (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId is required in query' });

  try {
    const [results] = await pool.query(
      `SELECT customer_id, customer_name FROM customers WHERE store_id = ?`,
      [storeId]
    );
    res.json(results);
  } catch (err) {
    console.error('🔴 Error fetching customers:', err.message);
    res.status(500).json({ error: 'Database error while fetching customers' });
  }
});

module.exports = router;
