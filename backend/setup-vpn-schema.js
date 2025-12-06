const mysql = require("mysql2/promise");
require("dotenv").config();

async function setupVPNSchema() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  try {
    console.log("Connected to MySQL server for VPN schema setup");

    // Switch to the vernie_pos database
    await connection.execute("USE vernie_pos");

    // Create VPN-related tables
    const vpnTables = [
      `CREATE TABLE IF NOT EXISTS system_status (
        id INT AUTO_INCREMENT PRIMARY KEY,
        status ENUM('ENABLED', 'DISABLED', 'MAINTENANCE') NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS service_disruptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        reason VARCHAR(255) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NULL,
        status ENUM('ACTIVE', 'RESOLVED') DEFAULT 'ACTIVE',
        downtime_ms INT NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      )`,

      `CREATE TABLE IF NOT EXISTS vpn_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        connection_status ENUM('CONNECTED', 'DISCONNECTED', 'CONNECTING', 'ERROR') NOT NULL,
        last_heartbeat TIMESTAMP NULL,
        response_time_ms INT NULL,
        failure_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      )`,

      `CREATE TABLE IF NOT EXISTS sync_operations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        operation_type ENUM('INVENTORY_SYNC', 'TRANSACTION_SYNC', 'FULL_SYNC') NOT NULL,
        records_count INT DEFAULT 0,
        status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
        error_message TEXT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      )`,

      `CREATE TABLE IF NOT EXISTS transaction_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(50) UNIQUE NOT NULL,
        branch_id INT NOT NULL,
        transaction_data JSON NOT NULL,
        status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
        retry_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        error_message TEXT NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      )`,

      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        event_data JSON NULL,
        user_id INT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS failover_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        event_type ENUM('FAILOVER', 'RECOVERY') NOT NULL,
        reason VARCHAR(255) NOT NULL,
        severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
        event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_time TIMESTAMP NULL,
        backup_used VARCHAR(255) NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      )`
    ];

    for (const table of vpnTables) {
      await connection.execute(table);
    }
    console.log("VPN schema tables created successfully");

    // Create indexes for performance
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_service_disruptions_branch_time ON service_disruptions(branch_id, start_time)",
      "CREATE INDEX IF NOT EXISTS idx_vpn_connections_branch ON vpn_connections(branch_id)",
      "CREATE INDEX IF NOT EXISTS idx_transaction_queue_status ON transaction_queue(status, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_sync_operations_branch ON sync_operations(branch_id, started_at)",
      "CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_time ON audit_logs(branch_id, timestamp)",
      "CREATE INDEX IF NOT EXISTS idx_failover_events_branch ON failover_events(branch_id, event_time)"
    ];

    for (const index of indexes) {
      await connection.execute(index);
    }
    console.log("VPN schema indexes created successfully");

    // Insert initial system status
    await connection.execute(
      "INSERT IGNORE INTO system_status (status, message) VALUES ('ENABLED', 'System operational')"
    );

    console.log("VPN schema setup completed successfully!");
  } catch (error) {
    console.error("VPN schema setup failed:", error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Run the setup
if (require.main === module) {
  setupVPNSchema();
}

module.exports = { setupVPNSchema };