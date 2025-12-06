const mysql = require("mysql2/promise");
const axios = require("axios");

class VPNMonitor {
  constructor(config) {
    this.centralServerUrl = config.centralServerUrl;
    this.branchId = config.branchId;
    this.heartbeatInterval = config.heartbeatInterval || 30000; // 30 seconds
    this.timeoutThreshold = config.timeoutThreshold || 10000; // 10 seconds
    this.maxFailures = config.maxFailures || 3;
    this.isOnline = false;
    this.failureCount = 0;
    this.heartbeatTimer = null;
    this.callbacks = {
      online: [],
      offline: [],
      serviceDisruption: []
    };
  }

  // Start monitoring
  start() {
    console.log(`Starting VPN monitor for branch ${this.branchId}`);
    this.heartbeatTimer = setInterval(() => {
      this.checkConnection();
    }, this.heartbeatInterval);
    
    // Initial check
    this.checkConnection();
  }

  // Stop monitoring
  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    console.log(`VPN monitor stopped for branch ${this.branchId}`);
  }

  // Check connection to central server
  async checkConnection() {
    try {
      const startTime = Date.now();
      
      const response = await axios.get(`${this.centralServerUrl}/api/heartbeat`, {
        timeout: this.timeoutThreshold,
        headers: {
          'X-Branch-ID': this.branchId,
          'X-Timestamp': Date.now()
        }
      });

      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        this.handleSuccess(responseTime);
      } else {
        this.handleFailure();
      }
    } catch (error) {
      this.handleFailure(error);
    }
  }

  // Handle successful connection
  handleSuccess(responseTime) {
    if (!this.isOnline) {
      console.log(`Branch ${this.branchId} is now online (response time: ${responseTime}ms)`);
      this.isOnline = true;
      this.failureCount = 0;
      this.triggerCallbacks('online', { responseTime, branchId: this.branchId });
    }
  }

  // Handle connection failure
  handleFailure(error = null) {
    this.failureCount++;
    console.log(`Branch ${this.branchId} connection failure ${this.failureCount}/${this.maxFailures}`);
    
    if (this.failureCount >= this.maxFailures && this.isOnline) {
      console.log(`Branch ${this.branchId} is now offline - initiating service disruption`);
      this.isOnline = false;
      this.triggerCallbacks('offline', { 
        failureCount: this.failureCount, 
        error, 
        branchId: this.branchId 
      });
      this.triggerCallbacks('serviceDisruption', { 
        reason: 'Central server unreachable',
        branchId: this.branchId 
      });
    }
  }

  // Register event callbacks
  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
  }

  // Trigger event callbacks
  triggerCallbacks(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} callback:`, error);
        }
      });
    }
  }

  // Get current status
  getStatus() {
    return {
      isOnline: this.isOnline,
      failureCount: this.failureCount,
      branchId: this.branchId,
      lastCheck: new Date()
    };
  }
}

module.exports = VPNMonitor;