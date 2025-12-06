class ServiceDisruptionController {
  constructor(vpnMonitor, db) {
    this.vpnMonitor = vpnMonitor;
    this.db = db;
    this.isDisrupted = false;
    this.disruptionStartTime = null;
    
    // Register event handlers
    this.vpnMonitor.on('serviceDisruption', (data) => {
      this.handleServiceDisruption(data);
    });
    
    this.vpnMonitor.on('online', (data) => {
      this.handleServiceRecovery(data);
    });
  }

  // Handle service disruption
  async handleServiceDisruption(data) {
    if (this.isDisrupted) return;
    
    this.isDisrupted = true;
    this.disruptionStartTime = new Date();
    
    console.log(`SERVICE DISRUPTION: Branch ${data.branchId} operations stopped`);
    
    // Log disruption
    await this.logDisruption(data);
    
    // Disable POS operations
    await this.disablePOSOperations();
    
    // Notify all connected clients
    this.notifyClients({
      type: 'SERVICE_DISRUPTION',
      message: 'Central server is unreachable. All POS operations have been stopped.',
      timestamp: this.disruptionStartTime,
      branchId: data.branchId
    });
  }

  // Handle service recovery
  async handleServiceRecovery(data) {
    if (!this.isDisrupted) return;
    
    const recoveryTime = new Date();
    const downtime = recoveryTime - this.disruptionStartTime;
    
    this.isDisrupted = false;
    this.disruptionStartTime = null;
    
    console.log(`SERVICE RECOVERY: Branch ${data.branchId} operations resumed (downtime: ${downtime}ms)`);
    
    // Log recovery
    await this.logRecovery(data, downtime);
    
    // Re-enable POS operations
    await this.enablePOSOperations();
    
    // Notify all connected clients
    this.notifyClients({
      type: 'SERVICE_RECOVERY',
      message: 'Connection to central server restored. POS operations can now resume.',
      timestamp: recoveryTime,
      branchId: data.branchId,
      downtime
    });
  }

  // Disable POS operations
  async disablePOSOperations() {
    try {
      // Set system flag to disable operations
      await this.db.execute(
        "INSERT INTO system_status (status, message, created_at) VALUES (?, ?, NOW())",
        ['DISABLED', 'Central server unreachable - operations suspended']
      );
      
      // Force disconnect all active POS sessions
      await this.db.execute(
        "UPDATE user_sessions SET active = FALSE WHERE status = 'active'"
      );
      
      console.log('POS operations disabled');
    } catch (error) {
      console.error('Failed to disable POS operations:', error);
    }
  }

  // Enable POS operations
  async enablePOSOperations() {
    try {
      // Clear system flag
      await this.db.execute(
        "INSERT INTO system_status (status, message, created_at) VALUES (?, ?, NOW())",
        ['ENABLED', 'Connection restored - operations enabled']
      );
      
      console.log('POS operations enabled');
    } catch (error) {
      console.error('Failed to enable POS operations:', error);
    }
  }

  // Log disruption event
  async logDisruption(data) {
    try {
      await this.db.execute(
        "INSERT INTO service_disruptions (branch_id, reason, start_time, status) VALUES (?, ?, NOW(), 'ACTIVE')",
        [data.branchId, data.reason || 'Central server unreachable']
      );
    } catch (error) {
      console.error('Failed to log disruption:', error);
    }
  }

  // Log recovery event
  async logRecovery(data, downtime) {
    try {
      await this.db.execute(
        "UPDATE service_disruptions SET end_time = NOW(), status = 'RESOLVED', downtime_ms = ? WHERE branch_id = ? AND status = 'ACTIVE'",
        [downtime, data.branchId]
      );
    } catch (error) {
      console.error('Failed to log recovery:', error);
    }
  }

  // Notify connected clients (WebSocket, SSE, etc.)
  notifyClients(notification) {
    // This would integrate with your notification system
    console.log('Client notification:', notification);
    
    // Example: WebSocket broadcast
    if (global.io) {
      global.io.emit('system-status', notification);
    }
  }

  // Get current disruption status
  getStatus() {
    return {
      isDisrupted: this.isDisrupted,
      disruptionStartTime: this.disruptionStartTime,
      vpnStatus: this.vpnMonitor.getStatus()
    };
  }
}

module.exports = ServiceDisruptionController;