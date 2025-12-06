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
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Only owners can create products" });
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
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Only owners can update products" });
    }

    const { id } = req.params;
    const { name, description, price } = req.body;

    await db.execute(
      "UPDATE products SET name = ?, description = ?, price = ? WHERE id = ?",
      [name, description, price, id],
    );

    await logActivity(req.user.id, `Updated product ID: ${id}`);

    res.json({ message: "Product updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Product update failed" });
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

app.listen(PORT, async () => {
  await initDB();
  console.log(`Server running on port ${PORT}`);
});
