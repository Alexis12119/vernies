const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

app.use(express.json());

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "vernie_pos",
};

let db;

async function initDB() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log("Connected to MySQL database");
  } catch (error) {
    console.error("Database connection failed:", error);
    console.error(
      'Please run "pnpm run setup-db" first to create and seed the database',
    );
    process.exit(1);
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "your-secret-key",
    (err, user) => {
      if (err) {
        return res.status(403).json({ error: "Invalid token" });
      }
      req.user = user;
      next();
    },
  );
}

async function logActivity(userId, action) {
  await db.execute(
    "INSERT INTO activity_logs (user_id, action) VALUES (?, ?)",
    [userId, action],
  );
}

// Bypass CORS for login
app.post(
  "/login",
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    console.log('Login request body:', req.body);
    next();
  },
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const [users] = await db.execute("SELECT * FROM users WHERE email = ?", [
        email,
      ]);

      if (users.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const user = users[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          branch_id: user.branch_id,
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" },
      );

      await logActivity(user.id, "Login");

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          branch_id: user.branch_id,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  },
);

app.post("/register", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Only owners can create users" });
    }

    const { email, password, role, branch_id } = req.body;

    const [existingUsers] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email],
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.execute(
      "INSERT INTO users (email, password_hash, role, branch_id) VALUES (?, ?, ?, ?)",
      [email, hashedPassword, role, branch_id || null],
    );

    await logActivity(req.user.id, `Created user: ${email}`);

    res.status(201).json({
      message: "User created successfully",
      user_id: result.insertId,
    });
  } catch (error) {
    res.status(500).json({ error: "User creation failed" });
  }
});

app.get("/products", authenticateToken, async (req, res) => {
  try {
    let query = "SELECT * FROM products";
    const params = [];

    if (req.user.role !== "owner") {
      query = `
        SELECT p.*, COALESCE(i.stock, 0) as stock 
        FROM products p 
        LEFT JOIN inventory i ON p.id = i.product_id AND i.branch_id = ?
      `;
      params.push(req.user.branch_id);
    }

    const [products] = await db.execute(query, params);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/products", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "owner" && req.user.role !== "branch_admin") {
      return res.status(403).json({ error: "Only owners and branch admins can create products" });
    }

    const { name, description, price } = req.body;

    const [result] = await db.execute(
      "INSERT INTO products (name, description, price) VALUES (?, ?, ?)",
      [name, description, price],
    );

    await logActivity(req.user.id, `Created product: ${name}`);

    res.status(201).json({
      message: "Product created successfully",
      product_id: result.insertId,
    });
  } catch (error) {
    res.status(500).json({ error: "Product creation failed" });
  }
});

app.put("/products/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "owner" && req.user.role !== "branch_admin") {
      return res.status(403).json({ error: "Only owners and branch admins can update products" });
    }

    const { id } = req.params;
    
    // Log the entire request for debugging
    console.log('=== PRODUCT UPDATE REQUEST ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('User:', req.user);
    console.log('================================');
    
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: "Invalid request body. Please send JSON data." });
    }
    
    const { name, description, price } = req.body;
    
    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: "Product name is required" });
    }
    
    if (!price || parseFloat(price) <= 0) {
      return res.status(400).json({ error: "Product price must be greater than 0" });
    }

    const [result] = await db.execute(
      "UPDATE products SET name = ?, description = ?, price = ? WHERE id = ?",
      [name, description, price, id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    await logActivity(req.user.id, `Updated product ID: ${id}`);

    res.json({ message: "Product updated successfully" });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({ error: "Product update failed", details: error.message });
  }
});

app.delete("/products/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "owner" && req.user.role !== "branch_admin") {
      return res.status(403).json({ error: "Only owners and branch admins can delete products" });
    }

    const { id } = req.params;

    // Prevent deletion if product is used in sales
    const [salesCheck] = await db.execute(
      "SELECT COUNT(*) as count FROM sales_items WHERE product_id = ?",
      [id]
    );

    if (salesCheck[0].count > 0) {
      return res.status(400).json({ 
        error: "Cannot delete product that has been used in sales" 
      });
    }

    await db.execute("DELETE FROM products WHERE id = ?", [id]);

    await logActivity(req.user.id, `Deleted product ID: ${id}`);

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product" });
  }
});

app.post("/sales", authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items in sale" });
    }

    const branchId = req.user.role === "owner" ? 1 : req.user.branch_id;

    await db.execute("START TRANSACTION");

    try {
      let totalAmount = 0;

      for (const item of items) {
        const [inventory] = await db.execute(
          "SELECT stock FROM inventory WHERE product_id = ? AND branch_id = ?",
          [item.product_id, branchId],
        );

        if (inventory.length === 0 || inventory[0].stock < item.qty) {
          throw new Error(`Insufficient stock for product ${item.product_id}`);
        }

        await db.execute(
          "UPDATE inventory SET stock = stock - ? WHERE product_id = ? AND branch_id = ?",
          [item.qty, item.product_id, branchId],
        );

        await checkLowStock(item.product_id, branchId);

        totalAmount += item.price * item.qty;
      }

      const [saleResult] = await db.execute(
        "INSERT INTO sales (branch_id, cashier_id, total_amount) VALUES (?, ?, ?)",
        [branchId, req.user.id, totalAmount],
      );

      const saleId = saleResult.insertId;

      for (const item of items) {
        await db.execute(
          "INSERT INTO sales_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)",
          [saleId, item.product_id, item.qty, item.price],
        );
      }

      await db.execute("COMMIT");
      await logActivity(req.user.id, `Created sale #${saleId}`);

      res.json({
        message: "Sale completed successfully",
        sale_id: saleId,
        total_amount: totalAmount,
      });
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: error.message || "Sale failed" });
  }
});

app.get("/sales", authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT s.*, u.email as cashier_email, b.name as branch_name
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      JOIN branches b ON s.branch_id = b.id
    `;
    const params = [];

    if (req.user.role !== "owner") {
      query += " WHERE s.branch_id = ?";
      params.push(req.user.branch_id);
    }

    query += " ORDER BY s.created_at DESC";

    const [sales] = await db.execute(query, params);
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sales" });
  }
});

app.get("/inventory", authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT i.*, p.name as product_name, p.price, b.name as branch_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN branches b ON i.branch_id = b.id
    `;
    const params = [];

    if (req.user.role !== "owner") {
      query += " WHERE i.branch_id = ?";
      params.push(req.user.branch_id);
    }

    const [inventory] = await db.execute(query, params);
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

app.post("/inventory", authenticateToken, async (req, res) => {
  try {
    if (req.user.role === "cashier") {
      return res
        .status(403)
        .json({ error: "Cashiers cannot update inventory" });
    }

    const { product_id, branch_id, stock } = req.body;

    if (req.user.role !== "owner" && branch_id !== req.user.branch_id) {
      return res
        .status(403)
        .json({ error: "Can only update your branch inventory" });
    }

    await db.execute(
      "INSERT INTO inventory (product_id, branch_id, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = ?",
      [product_id, branch_id, stock, stock],
    );

    await checkLowStock(product_id, branch_id);

    await logActivity(
      req.user.id,
      `Updated inventory for product ${product_id}`,
    );

    res.json({ message: "Inventory updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update inventory" });
  }
});

app.get("/branches", authenticateToken, async (req, res) => {
  try {
    const [branches] = await db.execute("SELECT * FROM branches");
    res.json(branches);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch branches" });
  }
});

app.get("/users", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Only owners can view users" });
    }

    const [users] = await db.execute(`
      SELECT u.id, u.email, u.role, u.branch_id, b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
    `);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get("/activity-logs", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res
        .status(403)
        .json({ error: "Only owners can view activity logs" });
    }

    const [logs] = await db.execute(`
      SELECT al.*, u.email as user_email
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC
      LIMIT 100
    `);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch activity logs" });
  }
});

app.put("/users/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Only owners can update users" });
    }

    const { id } = req.params;
    const { email, role, branch_id, password } = req.body;

    // Build update query dynamically
    let updateFields = [];
    let updateValues = [];

    if (email) {
      updateFields.push("email = ?");
      updateValues.push(email);
    }
    if (role) {
      updateFields.push("role = ?");
      updateValues.push(role);
    }
    if (branch_id !== undefined) {
      updateFields.push("branch_id = ?");
      updateValues.push(branch_id || null);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push("password_hash = ?");
      updateValues.push(hashedPassword);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updateValues.push(id);

    await db.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    await logActivity(req.user.id, `Updated user ID: ${id}`);

    res.json({ message: "User updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.delete("/users/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Only owners can delete users" });
    }

    const { id } = req.params;

    // Prevent deletion of current user
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    await db.execute("DELETE FROM users WHERE id = ?", [id]);

    await logActivity(req.user.id, `Deleted user ID: ${id}`);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Notification endpoints
app.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const [notifications] = await db.execute(`
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.user.id]);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.post("/notifications/:id/read", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(
      "UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );
    res.json({ message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

app.post("/notifications/read-all", authenticateToken, async (req, res) => {
  try {
    await db.execute(
      "UPDATE notifications SET is_read = TRUE WHERE user_id = ?",
      [req.user.id]
    );
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

app.get("/notification-preferences", authenticateToken, async (req, res) => {
  try {
    const [preferences] = await db.execute(
      "SELECT * FROM notification_preferences WHERE user_id = ?",
      [req.user.id]
    );
    
    if (preferences.length === 0) {
      await db.execute(
        "INSERT INTO notification_preferences (user_id) VALUES (?)",
        [req.user.id]
      );
      const [newPreferences] = await db.execute(
        "SELECT * FROM notification_preferences WHERE user_id = ?",
        [req.user.id]
      );
      res.json(newPreferences[0]);
    } else {
      res.json(preferences[0]);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
});

app.put("/notification-preferences", authenticateToken, async (req, res) => {
  try {
    const { low_stock_alerts, system_alerts, email_notifications } = req.body;
    
    await db.execute(
      `UPDATE notification_preferences 
       SET low_stock_alerts = ?, system_alerts = ?, email_notifications = ? 
       WHERE user_id = ?`,
      [low_stock_alerts, system_alerts, email_notifications, req.user.id]
    );
    
    res.json({ message: "Notification preferences updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

async function createNotification(userId, title, message, type = 'info') {
  try {
    const [preferences] = await db.execute(
      "SELECT * FROM notification_preferences WHERE user_id = ?",
      [userId]
    );
    
    const userPrefs = preferences[0];
    if (!userPrefs) return;
    
    if (type === 'low_stock' && !userPrefs.low_stock_alerts) return;
    if (type === 'system' && !userPrefs.system_alerts) return;
    
    // Ensure type is a valid ENUM value
    const validTypes = ['low_stock', 'system', 'info'];
    const notificationType = validTypes.includes(type) ? type : 'info';
    
    // Check for duplicate notification within last 5 minutes
    const [existingNotifications] = await db.execute(
      `SELECT id FROM notifications 
       WHERE user_id = ? AND title = ? AND message = ? AND type = ? 
       AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
      [userId, title, message, notificationType]
    );
    
    if (existingNotifications.length > 0) {
      console.log('Duplicate notification prevented');
      return;
    }
    
    await db.execute(
      "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
      [userId, title, message, notificationType]
    );
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

async function checkLowStock(productId, branchId) {
  try {
    const [inventory] = await db.execute(
      "SELECT i.stock, p.name FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.product_id = ? AND i.branch_id = ?",
      [productId, branchId]
    );
    
    if (inventory.length > 0 && inventory[0].stock <= 10) {
      const [admins] = await db.execute(
        "SELECT id FROM users WHERE role IN ('owner', 'branch_admin') AND (branch_id = ? OR role = 'owner')",
        [branchId]
      );
      
      for (const admin of admins) {
        await createNotification(
          admin.id,
          "Low Stock Alert",
          `Product "${inventory[0].name}" at branch ${branchId} has only ${inventory[0].stock} units remaining. Restocking is needed.`,
          'low_stock'
        );
      }
    }
  } catch (error) {
    console.error("Failed to check low stock:", error);
  }
}

async function checkAllLowStock() {
  try {
    const [lowStockItems] = await db.execute(`
      SELECT i.product_id, i.branch_id, i.stock, p.name, b.name as branch_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN branches b ON i.branch_id = b.id
      WHERE i.stock <= 10
    `);
    
    for (const item of lowStockItems) {
      const [admins] = await db.execute(
        "SELECT id FROM users WHERE role IN ('owner', 'branch_admin') AND (branch_id = ? OR role = 'owner')",
        [item.branch_id]
      );
      
      for (const admin of admins) {
        await createNotification(
          admin.id,
          "Low Stock Alert",
          `Product "${item.name}" at ${item.branch_name} has only ${item.stock} units remaining. Restocking is needed.`,
          'low_stock'
        );
      }
    }
  } catch (error) {
    console.error("Failed to check all low stock:", error);
  }
}

// Schedule low stock check every 5 minutes
setInterval(async () => {
  try {
    await checkAllLowStock();
  } catch (error) {
    console.error("Scheduled low stock check failed:", error);
  }
}, 5 * 60 * 1000);

app.listen(PORT, async () => {
  await initDB();
  console.log(`Server running on port ${PORT}`);
  
  // Run initial low stock check after server starts
  setTimeout(async () => {
    try {
      await checkAllLowStock();
      console.log("Initial low stock check completed");
    } catch (error) {
      console.error("Initial low stock check failed:", error);
    }
  }, 5000);
});
