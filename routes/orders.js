const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
require('dotenv').config();

// ✅ DB Connection
const db = mysql.createConnection({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  port: 3306,
  ssl: { rejectUnauthorized: false }
});

// ✅ GET all orders for a store
router.get('/', (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId is required in query' });

  const sql = `
    SELECT o.order_id, o.date_ordered, o.total_amount, o.status, c.customer_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    WHERE c.store_id = ?
    ORDER BY o.date_ordered DESC
  `;

  db.query(sql, [storeId], (err, results) => {
    if (err) {
      console.error('🔴 Error fetching orders:', err.message);
      return res.status(500).json({ error: 'Database error while fetching orders' });
    }
    res.json(results);
  });
});

// ✅ POST new order
router.post('/', (req, res) => {
  const { customer_id, total_amount, status, items, store_id } = req.body;

  if (!customer_id || !total_amount || !status || !store_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields (customer_id, total_amount, status, store_id, items)' });
  }

  const orderSql = `
    INSERT INTO orders (date_ordered, total_amount, customer_id, status)
    VALUES (NOW(), ?, ?, ?)
  `;

  db.query(orderSql, [total_amount, customer_id, status], (err, result) => {
    if (err) {
      console.error('🔴 Error inserting into orders:', err.message);
      return res.status(500).json({ error: 'Database error while inserting order' });
    }

    const orderId = result.insertId;
    const itemSql = `INSERT INTO order_items (order_id, product_id, quantity, store_id) VALUES ?`;
    const values = items.map(item => [orderId, item.product_id, item.quantity, store_id]);

    db.query(itemSql, [values], (itemErr) => {
      if (itemErr) {
        console.error('🔴 Error inserting into order_items:', itemErr.message);
        return res.status(500).json({ error: 'Database error while inserting order items' });
      }

      res.status(201).json({ message: '✅ Order and items saved successfully', orderId });
    });
  });
});

// ✅ PUT update order status and insert into sales if Delivered
router.put('/:orderId/status', (req, res) => {
  const { orderId } = req.params;
  const { status, storeId } = req.body;

  if (!status || !storeId) {
    return res.status(400).json({ error: 'Both status and storeId are required in body' });
  }

  const updateSql = `
    UPDATE orders o
    JOIN customers c ON o.customer_id = c.customer_id
    SET o.status = ?
    WHERE o.order_id = ? AND c.store_id = ?
  `;

  db.query(updateSql, [status, orderId, storeId], (err, result) => {
    if (err) {
      console.error('🔴 Error updating order status:', err.message);
      return res.status(500).json({ error: 'Database error while updating order status' });
    }

    if (result.affectedRows === 0) {
      return res.status(403).json({ error: 'Unauthorized: Order not found for this store' });
    }

    if (status !== 'Delivered') {
      return res.json({ message: '✅ Order status updated successfully' });
    }

    // ✅ Insert into sales if Delivered
    const fetchItemsSql = `
      SELECT 
        oi.product_id, oi.quantity, p.price,
        o.customer_id, o.date_ordered
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.order_id
      JOIN customers c ON o.customer_id = c.customer_id
      JOIN products p ON oi.product_id = p.product_id
      WHERE oi.order_id = ? AND c.store_id = ?
    `;

    db.query(fetchItemsSql, [orderId, storeId], (itemErr, items) => {
      if (itemErr) {
        console.error('🔴 Error fetching order items for sales:', itemErr.message);
        return res.status(500).json({ error: 'Error preparing sales record' });
      }

      if (!items || items.length === 0) {
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

      const insertSalesSql = `
        INSERT INTO sales (
          sale_date, sale_type, product_id,
          quantity_sold, unit_price_at_sale,
          total_sale_amount, store_id, customer_id
        ) VALUES ?
      `;

      db.query(insertSalesSql, [salesValues], (salesErr) => {
        if (salesErr) {
          console.error('🔴 Error inserting into sales:', salesErr.message);
          return res.status(500).json({ error: 'Failed to record sales data' });
        }

        res.json({ message: '✅ Order marked as Delivered and sales recorded' });
      });
    });
  });
});

// ✅ GET products for a store
router.get('/products', (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId is required in query' });

  const sql = `SELECT * FROM products WHERE store_id = ?`;

  db.query(sql, [storeId], (err, results) => {
    if (err) {
      console.error('🔴 Error fetching products:', err.message);
      return res.status(500).json({ error: 'Database error while fetching products' });
    }

    res.json(results);
  });
});

// ✅ GET customers for a store
router.get('/customers_orders', (req, res) => {
  const storeId = req.query.storeId;
  if (!storeId) return res.status(400).json({ error: 'storeId is required in query' });

  const sql = `SELECT customer_id, customer_name FROM customers WHERE store_id = ?`;

  db.query(sql, [storeId], (err, results) => {
    if (err) {
      console.error('🔴 Error fetching customers:', err.message);
      return res.status(500).json({ error: 'Database error while fetching customers' });
    }
    res.json(results);
  });
});

module.exports = router;
