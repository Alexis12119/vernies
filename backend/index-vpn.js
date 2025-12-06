const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// Import VPN services
const VPNMonitor = require("./services/VPNMonitor");
const ServiceDisruptionController = require("./services/ServiceDisruptionController");
const LocalInventorySystem = require("./services/LocalInventorySystem");
const TransactionQueue = require("./services/TransactionQueue");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "franklin",
  password: process.env.DB_PASSWORD || "123",
  database: process.env.DB_NAME || "vernie_pos",
};

let db;
let vpnServices = {};

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

// Initialize VPN services for each branch
async function initVPNServices() {
  try {
    // Check if this is a branch system (has BRANCH_ID in env)
    const isBranchSystem = process.env.BRANCH_ID;
    
    if (isBranchSystem) {
      // Single branch system
      const branchId = parseInt(process.env.BRANCH_ID);
      
      // Initialize VPN Monitor
      const vpnMonitor = new VPNMonitor({
        centralServerUrl:
          process.env.CENTRAL_SERVER_URL || "http://localhost:3001",
        branchId: branchId,
        heartbeatInterval: 30000,
        timeoutThreshold: 10000,
        maxFailures: 3,
      });

      // Initialize Service Disruption Controller
      const serviceController = new ServiceDisruptionController(vpnMonitor, db);

      // Initialize Local Inventory System
      const inventorySystem = new LocalInventorySystem({
        branchId: branchId,
        centralServerUrl:
          process.env.CENTRAL_SERVER_URL || "http://localhost:3001",
        syncInterval: 60000,
      });

      // Initialize Transaction Queue
      const transactionQueue = new TransactionQueue({
        branchId: branchId,
        centralServerUrl:
          process.env.CENTRAL_SERVER_URL || "http://localhost:3001",
        syncInterval: 30000,
        maxQueueSize: 1000,
      });

      vpnServices[branchId] = {
        vpnMonitor,
        serviceController,
        inventorySystem,
        transactionQueue
      };

      // Start services
      vpnMonitor.start();
      inventorySystem.start();
      transactionQueue.startProcessing();

      console.log(`VPN services initialized for branch ${branchId}`);
    } else {
      // Central server - initialize for all branches
      const [branches] = await db.execute("SELECT * FROM branches");

      for (const branch of branches) {
        const branchId = branch.id;

        // Initialize VPN Monitor
        const vpnMonitor = new VPNMonitor({
          centralServerUrl:
            process.env.CENTRAL_SERVER_URL || "http://localhost:3001",
          branchId: branchId,
          heartbeatInterval: 30000,
          timeoutThreshold: 10000,
          maxFailures: 3,
        });

        // Initialize Service Disruption Controller
        const serviceController = new ServiceDisruptionController(vpnMonitor, db);

        // Initialize Local Inventory System
        const inventorySystem = new LocalInventorySystem({
          branchId: branchId,
          centralServerUrl:
            process.env.CENTRAL_SERVER_URL || "http://localhost:3001",
          syncInterval: 60000,
        });

        // Initialize Transaction Queue
        const transactionQueue = new TransactionQueue({
          branchId: branchId,
          centralServerUrl:
            process.env.CENTRAL_SERVER_URL || "http://localhost:3001",
          syncInterval: 30000,
          maxQueueSize: 1000,
        });

        vpnServices[branchId] = {
          vpnMonitor,
          serviceController,
          inventorySystem,
          transactionQueue
        };

        // Start services
        vpnMonitor.start();
        inventorySystem.start();
        transactionQueue.startProcessing();

        console.log(`VPN services initialized for branch ${branchId}`);
      }
    }
  } catch (error) {
    console.error('Failed to initialize VPN services:', error);
  }
}

// Heartbeat endpoint for VPN monitoring
app.get("/api/heartbeat", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    server: "central",
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    services: {
      database: db ? "connected" : "disconnected",
      vpn: Object.keys(vpnServices).length > 0 ? "active" : "inactive",
    },
  });
});

// VPN status endpoint
app.get("/api/vpn/status", authenticateToken, async (req, res) => {
  try {
    const branchId = req.user.branch_id;
    const service = vpnServices[branchId];

    if (!service) {
      return res
        .status(404)
        .json({ error: "VPN services not found for branch" });
    }

    const status = {
      vpn: service.vpnMonitor.getStatus(),
      disruption: service.serviceController.getStatus(),
      inventory: await service.inventorySystem.getSyncStatus(),
      transactions: await service.transactionQueue.getQueueStatus(),
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Failed to get VPN status" });
  }
});

// Sync endpoint for inventory
app.post("/api/sync/inventory", authenticateToken, async (req, res) => {
  try {
    const { branchId, operations } = req.body;

    // Process inventory sync operations
    for (const operation of operations) {
      if (operation.table_name === "inventory") {
        await db.execute(
          "INSERT INTO inventory (product_id, branch_id, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = ?, updated_at = NOW()",
          [
            operation.data.product_id,
            operation.data.branch_id,
            operation.data.stock,
            operation.data.stock,
          ],
        );
      }
    }

    res.json({ success: true, processed: operations.length });
  } catch (error) {
    res.status(500).json({ error: "Sync failed" });
  }
});

// Transaction sync endpoint
app.post("/api/transactions", authenticateToken, async (req, res) => {
  try {
    const { branchId, transaction } = req.body;

    await db.execute("START TRANSACTION");

    try {
      // Create sale record
      const [saleResult] = await db.execute(
        "INSERT INTO sales (branch_id, cashier_id, total_amount) VALUES (?, ?, ?)",
        [
          transaction.branch_id,
          transaction.cashier_id,
          transaction.total_amount,
        ],
      );

      const saleId = saleResult.insertId;

      // Create sale items
      for (const item of transaction.items) {
        await db.execute(
          "INSERT INTO sales_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)",
          [saleId, item.product_id, item.qty, item.price],
        );
      }

      await db.execute("COMMIT");

      res.json({ success: true, saleId });
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: "Transaction sync failed" });
  }
});

// Modified sales endpoint to use transaction queue
app.post("/sales", authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;
    const branchId = req.user.role === "owner" ? 1 : req.user.branch_id;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items in sale" });
    }

    // Check if VPN services are available for this branch
    const service = vpnServices[branchId];

    if (service && !service.serviceController.getStatus().isDisrupted) {
      // Normal operation - process directly
      await processSale(req, res, items, branchId);
    } else if (service) {
      // Service disrupted - queue transaction
      const transactionData = {
        branch_id: branchId,
        cashier_id: req.user.id,
        items: items,
        total_amount: items.reduce(
          (sum, item) => sum + item.price * item.qty,
          0,
        ),
        timestamp: new Date().toISOString(),
      };

      const transactionId =
        await service.transactionQueue.addTransaction(transactionData);

      res.json({
        message: "Transaction queued (service disrupted)",
        transaction_id: transactionId,
        queued: true,
      });
    } else {
      // No VPN services - process directly (fallback)
      await processSale(req, res, items, branchId);
    }
  } catch (error) {
    res.status(500).json({ error: error.message || "Sale failed" });
  }
});

// Helper function to process sales
async function processSale(req, res, items, branchId) {
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
}

// Modified inventory endpoint to use local inventory system
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

    // Check if local inventory system is available
    const service = vpnServices[branch_id];

    if (service) {
      // Use local inventory system
      await service.inventorySystem.updateInventory(product_id, stock);
    } else {
      // Fallback to direct database update
      await db.execute(
        "INSERT INTO inventory (product_id, branch_id, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = ?",
        [product_id, branch_id, stock, stock],
      );
    }

    await logActivity(
      req.user.id,
      `Updated inventory for product ${product_id}`,
    );

    res.json({ message: "Inventory updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update inventory" });
  }
});

// Keep all existing endpoints...
// (All other endpoints from original file would remain here)

app.listen(PORT, async () => {
  await initDB();
  console.log(`Server running on port ${PORT}`);

  // Initialize VPN services after database is ready
  setTimeout(async () => {
    await initVPNServices();
    console.log("VPN services initialized");
  }, 2000);
});

