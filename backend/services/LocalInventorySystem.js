const mysql = require("mysql2/promise");
const axios = require("axios");

class LocalInventorySystem {
  constructor(config) {
    this.branchId = config.branchId;
    this.centralServerUrl = config.centralServerUrl;
    this.localDb = null;
    this.syncInterval = config.syncInterval || 60000; // 1 minute
    this.isOnline = false;
    this.syncTimer = null;
    this.pendingSync = [];
    
    this.initLocalDatabase();
  }

  // Initialize local database
  async initLocalDatabase() {
    try {
      // Use the same database connection as main system
      this.localDb = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "vernie_pos"
      });

      await this.createLocalTables();
      console.log(`Local inventory system initialized for branch ${this.branchId}`);
    } catch (error) {
      console.error('Failed to initialize local database:', error);
      throw error;
    }
  }

  // Create local tables
  async createLocalTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS local_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_product (product_id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        operation ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
        table_name VARCHAR(50) NOT NULL,
        data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT FALSE
      )`,
      
      `CREATE TABLE IF NOT EXISTS sync_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        operation_type VARCHAR(20) NOT NULL,
        records_count INT NOT NULL,
        status ENUM('SUCCESS', 'FAILED', 'PARTIAL') NOT NULL,
        error_message TEXT,
        sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.localDb.execute(table);
    }
  }

  // Start synchronization
  start() {
    console.log(`Starting inventory sync for branch ${this.branchId}`);
    this.syncTimer = setInterval(() => {
      this.syncWithCentral();
    }, this.syncInterval);
    
    // Initial sync
    this.syncWithCentral();
  }

  // Stop synchronization
  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    console.log(`Inventory sync stopped for branch ${this.branchId}`);
  }

  // Update local inventory
  async updateInventory(productId, newStock) {
    try {
      // Update local inventory
      await this.localDb.execute(
        "INSERT INTO local_inventory (product_id, stock) VALUES (?, ?) ON DUPLICATE KEY UPDATE stock = ?, last_sync = NOW()",
        [productId, newStock, newStock]
      );

      // Queue for sync
      await this.queueSyncOperation('UPDATE', 'inventory', {
        product_id: productId,
        stock: newStock,
        branch_id: this.branchId,
        timestamp: new Date().toISOString()
      });

      console.log(`Local inventory updated: Product ${productId} -> ${newStock}`);
    } catch (error) {
      console.error('Failed to update local inventory:', error);
      throw error;
    }
  }

  // Get local inventory
  async getLocalInventory() {
    try {
      const [inventory] = await this.localDb.execute(
        "SELECT * FROM local_inventory ORDER BY product_id"
      );
      return inventory;
    } catch (error) {
      console.error('Failed to get local inventory:', error);
      return [];
    }
  }

  // Queue sync operation
  async queueSyncOperation(operation, table, data) {
    try {
      await this.localDb.execute(
        "INSERT INTO sync_queue (operation, table_name, data) VALUES (?, ?, ?)",
        [operation, table, JSON.stringify(data)]
      );
    } catch (error) {
      console.error('Failed to queue sync operation:', error);
    }
  }

  // Sync with central server
  async syncWithCentral() {
    try {
      // Check if central server is available
      await this.checkCentralServer();
      
      if (!this.isOnline) {
        console.log('Central server offline - skipping sync');
        return;
      }

      // Get pending sync operations
      const [pendingOperations] = await this.localDb.execute(
        "SELECT * FROM sync_queue WHERE processed = FALSE ORDER BY created_at LIMIT 100"
      );

      if (pendingOperations.length === 0) {
        return;
      }

      console.log(`Syncing ${pendingOperations.length} operations with central server`);

      // Process operations in batches
      const batchSize = 10;
      for (let i = 0; i < pendingOperations.length; i += batchSize) {
        const batch = pendingOperations.slice(i, i + batchSize);
        await this.processSyncBatch(batch);
      }

    } catch (error) {
      console.error('Sync failed:', error);
      await this.logSync('SYNC_FAILED', 0, 'FAILED', error.message);
    }
  }

  // Process sync batch
  async processSyncBatch(batch) {
    try {
      const response = await axios.post(
        `${this.centralServerUrl}/api/sync/inventory`,
        {
          branchId: this.branchId,
          operations: batch
        },
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'X-Branch-ID': this.branchId
          }
        }
      );

      if (response.status === 200) {
        // Mark operations as processed
        const operationIds = batch.map(op => op.id);
        await this.localDb.execute(
          `UPDATE sync_queue SET processed = TRUE WHERE id IN (${operationIds.join(',')})`
        );

        await this.logSync('BATCH_SYNC', batch.length, 'SUCCESS');
        console.log(`Synced batch of ${batch.length} operations`);
      }

    } catch (error) {
      console.error('Batch sync failed:', error);
      await this.logSync('BATCH_SYNC', batch.length, 'FAILED', error.message);
    }
  }

  // Check central server availability
  async checkCentralServer() {
    try {
      const response = await axios.get(
        `${this.centralServerUrl}/api/health`,
        { timeout: 5000 }
      );
      this.isOnline = response.status === 200;
    } catch (error) {
      this.isOnline = false;
    }
  }

  // Log sync operations
  async logSync(operationType, recordCount, status, errorMessage = null) {
    try {
      await this.localDb.execute(
        "INSERT INTO sync_log (operation_type, records_count, status, error_message) VALUES (?, ?, ?, ?)",
        [operationType, recordCount, status, errorMessage]
      );
    } catch (error) {
      console.error('Failed to log sync:', error);
    }
  }

  // Force full sync
  async forceFullSync() {
    try {
      const localInventory = await this.getLocalInventory();
      
      const response = await axios.post(
        `${this.centralServerUrl}/api/sync/full`,
        {
          branchId: this.branchId,
          inventory: localInventory
        },
        {
          timeout: 60000,
          headers: {
            'Content-Type': 'application/json',
            'X-Branch-ID': this.branchId
          }
        }
      );

      if (response.status === 200) {
        await this.logSync('FULL_SYNC', localInventory.length, 'SUCCESS');
        console.log('Full sync completed successfully');
      }

    } catch (error) {
      await this.logSync('FULL_SYNC', 0, 'FAILED', error.message);
      console.error('Full sync failed:', error);
    }
  }

  // Get sync status
  async getSyncStatus() {
    try {
      const [pendingCount] = await this.localDb.execute(
        "SELECT COUNT(*) as count FROM sync_queue WHERE processed = FALSE"
      );
      
      const [recentSyncs] = await this.localDb.execute(
        "SELECT * FROM sync_log ORDER BY sync_time DESC LIMIT 10"
      );

      return {
        isOnline: this.isOnline,
        pendingOperations: pendingCount[0].count,
        recentSyncs,
        lastSync: recentSyncs[0]?.sync_time || null
      };
    } catch (error) {
      console.error('Failed to get sync status:', error);
      return null;
    }
  }
}

module.exports = LocalInventorySystem;