const mysql = require("mysql2/promise");
const fs = require("fs").promises;
const path = require("path");

class TransactionQueue {
  constructor(config) {
    this.branchId = config.branchId;
    this.centralServerUrl = config.centralServerUrl;
    this.localDb = null;
    this.queueFile = path.join(process.cwd(), 'data', `transactions_branch_${this.branchId}.json`);
    this.maxQueueSize = config.maxQueueSize || 1000;
    this.syncInterval = config.syncInterval || 30000; // 30 seconds
    this.isOnline = false;
    this.syncTimer = null;
    
    this.init();
  }

  // Initialize transaction queue
  async init() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.queueFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Use main database connection
      this.localDb = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "vernie_pos"
      });

      await this.createTables();
      await this.loadFromFile();
      
      console.log(`Transaction queue initialized for branch ${this.branchId}`);
    } catch (error) {
      console.error('Failed to initialize transaction queue:', error);
      throw error;
    }
  }

  // Create necessary tables
  async createTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS transaction_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(50) UNIQUE NOT NULL,
        transaction_data JSON NOT NULL,
        status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
        retry_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        error_message TEXT NULL
      )`,
      
      `CREATE TABLE IF NOT EXISTS transaction_backup (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(50) NOT NULL,
        transaction_data JSON NOT NULL,
        backup_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.localDb.execute(table);
    }
  }

  // Add transaction to queue
  async addTransaction(transactionData) {
    try {
      const transactionId = this.generateTransactionId();
      
      // Add to database queue
      await this.localDb.execute(
        "INSERT INTO transaction_queue (transaction_id, transaction_data) VALUES (?, ?)",
        [transactionId, JSON.stringify(transactionData)]
      );

      // Add to backup file
      await this.saveToFile(transactionId, transactionData);

      console.log(`Transaction queued: ${transactionId}`);
      return transactionId;
    } catch (error) {
      console.error('Failed to queue transaction:', error);
      throw error;
    }
  }

  // Generate unique transaction ID
  generateTransactionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `TXN_${this.branchId}_${timestamp}_${random}`;
  }

  // Start processing queue
  startProcessing() {
    console.log(`Starting transaction queue processing for branch ${this.branchId}`);
    this.syncTimer = setInterval(() => {
      this.processQueue();
    }, this.syncInterval);
    
    // Initial processing
    this.processQueue();
  }

  // Stop processing queue
  stopProcessing() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    console.log(`Transaction queue processing stopped for branch ${this.branchId}`);
  }

  // Process queued transactions
  async processQueue() {
    try {
      // Check if central server is available
      await this.checkCentralServer();
      
      if (!this.isOnline) {
        console.log('Central server offline - transactions remain queued');
        return;
      }

      // Get pending transactions
      const [pendingTransactions] = await this.localDb.execute(
        "SELECT * FROM transaction_queue WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 20"
      );

      if (pendingTransactions.length === 0) {
        return;
      }

      console.log(`Processing ${pendingTransactions.length} queued transactions`);

      // Process each transaction
      for (const transaction of pendingTransactions) {
        await this.processTransaction(transaction);
      }

    } catch (error) {
      console.error('Queue processing failed:', error);
    }
  }

  // Process individual transaction
  async processTransaction(transaction) {
    try {
      // Mark as processing
      await this.localDb.execute(
        "UPDATE transaction_queue SET status = 'PROCESSING' WHERE id = ?",
        [transaction.id]
      );

      const transactionData = JSON.parse(transaction.transaction_data);

      // Send to central server
      const response = await this.sendToCentralServer(transactionData);

      if (response.success) {
        // Mark as completed
        await this.localDb.execute(
          "UPDATE transaction_queue SET status = 'COMPLETED', processed_at = NOW() WHERE id = ?",
          [transaction.id]
        );

        // Remove from backup file
        await this.removeFromBackup(transaction.transaction_id);

        console.log(`Transaction processed successfully: ${transaction.transaction_id}`);
      } else {
        throw new Error(response.error || 'Server rejected transaction');
      }

    } catch (error) {
      // Mark as failed and increment retry count
      await this.localDb.execute(
        "UPDATE transaction_queue SET status = 'FAILED', retry_count = retry_count + 1, error_message = ? WHERE id = ?",
        [error.message, transaction.id]
      );

      // Re-queue if retry count is below threshold
      if (transaction.retry_count < 5) {
        await this.localDb.execute(
          "UPDATE transaction_queue SET status = 'PENDING' WHERE id = ?",
          [transaction.id]
        );
      }

      console.error(`Transaction processing failed: ${transaction.transaction_id} - ${error.message}`);
    }
  }

  // Send transaction to central server
  async sendToCentralServer(transactionData) {
    try {
      const response = await axios.post(
        `${this.centralServerUrl}/api/transactions`,
        {
          branchId: this.branchId,
          transaction: transactionData,
          timestamp: new Date().toISOString()
        },
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'X-Branch-ID': this.branchId
          }
        }
      );

      return { success: response.status === 200, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Check central server availability
  async checkCentralServer() {
    try {
      const axios = require("axios");
      const response = await axios.get(
        `${this.centralServerUrl}/api/health`,
        { timeout: 5000 }
      );
      this.isOnline = response.status === 200;
    } catch (error) {
      this.isOnline = false;
    }
  }

  // Save transaction to backup file
  async saveToFile(transactionId, transactionData) {
    try {
      let transactions = [];
      
      try {
        const data = await fs.readFile(this.queueFile, 'utf8');
        transactions = JSON.parse(data);
      } catch (error) {
        // File doesn't exist or is empty
      }

      transactions.push({
        id: transactionId,
        data: transactionData,
        timestamp: new Date().toISOString()
      });

      // Keep only last 1000 transactions in file
      if (transactions.length > this.maxQueueSize) {
        transactions = transactions.slice(-this.maxQueueSize);
      }

      await fs.writeFile(this.queueFile, JSON.stringify(transactions, null, 2));
    } catch (error) {
      console.error('Failed to save transaction to file:', error);
    }
  }

  // Load transactions from backup file
  async loadFromFile() {
    try {
      const data = await fs.readFile(this.queueFile, 'utf8');
      const transactions = JSON.parse(data);

      for (const transaction of transactions) {
        // Check if transaction already exists in database
        const [existing] = await this.localDb.execute(
          "SELECT id FROM transaction_queue WHERE transaction_id = ?",
          [transaction.id]
        );

        if (existing.length === 0) {
          await this.localDb.execute(
            "INSERT INTO transaction_queue (transaction_id, transaction_data) VALUES (?, ?)",
            [transaction.id, JSON.stringify(transaction.data)]
          );
        }
      }

      console.log(`Loaded ${transactions.length} transactions from backup file`);
    } catch (error) {
      console.log('No backup file found or empty');
    }
  }

  // Remove transaction from backup file
  async removeFromBackup(transactionId) {
    try {
      const data = await fs.readFile(this.queueFile, 'utf8');
      let transactions = JSON.parse(data);

      transactions = transactions.filter(t => t.id !== transactionId);

      await fs.writeFile(this.queueFile, JSON.stringify(transactions, null, 2));
    } catch (error) {
      console.error('Failed to remove transaction from backup:', error);
    }
  }

  // Get queue status
  async getQueueStatus() {
    try {
      const [status] = await this.localDb.execute(`
        SELECT 
          status,
          COUNT(*) as count
        FROM transaction_queue 
        GROUP BY status
      `);

      const [oldestPending] = await this.localDb.execute(
        "SELECT created_at FROM transaction_queue WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1"
      );

      return {
        isOnline: this.isOnline,
        queueStatus: status.reduce((acc, item) => {
          acc[item.status] = item.count;
          return acc;
        }, {}),
        oldestPendingTransaction: oldestPending[0]?.created_at || null
      };
    } catch (error) {
      console.error('Failed to get queue status:', error);
      return null;
    }
  }

  // Force retry failed transactions
  async retryFailedTransactions() {
    try {
      await this.localDb.execute(
        "UPDATE transaction_queue SET status = 'PENDING' WHERE status = 'FAILED' AND retry_count < 5"
      );
      console.log('Retrying failed transactions');
    } catch (error) {
      console.error('Failed to retry transactions:', error);
    }
  }
}

module.exports = TransactionQueue;