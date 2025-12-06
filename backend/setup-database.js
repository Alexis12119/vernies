const mysql = require("mysql2/promise");
require("dotenv").config();

async function setupDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  try {
    console.log("Connected to MySQL server");

    // Create database if it doesn't exist
    await connection.execute("CREATE DATABASE IF NOT EXISTS vernie_pos");
    console.log('Database "vernie_pos" created or already exists');

    // Switch to the vernie_pos database
    await connection.execute("USE vernie_pos");

    // Create tables
    const tables = [
      `CREATE TABLE IF NOT EXISTS branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('cashier', 'branch_admin', 'owner') NOT NULL,
        branch_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      )`,

      `CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        branch_id INT NOT NULL,
        stock INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_product_branch (product_id, branch_id),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      )`,

      `CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NOT NULL,
        cashier_id INT NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (cashier_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS sales_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT NOT NULL,
        product_id INT NOT NULL,
        qty INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )`,

      `CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        action VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
    ];

    for (const table of tables) {
      await connection.execute(table);
    }
    console.log("All tables created successfully");

    // Seed initial data
    await seedData(connection);
    console.log("Database setup completed successfully!");
  } catch (error) {
    console.error("Database setup failed:", error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

async function seedData(connection) {
  const bcrypt = require("bcryptjs");

  // Check if data already exists
  const [branchesCount] = await connection.execute(
    "SELECT COUNT(*) as count FROM branches",
  );
  if (branchesCount[0].count > 0) {
    console.log("Database already contains data. Skipping seeding.");
    return;
  }

  console.log("Seeding initial data...");

  // Insert branches
  await connection.execute("INSERT INTO branches (name) VALUES (?)", [
    "Main Branch",
  ]);
  await connection.execute("INSERT INTO branches (name) VALUES (?)", [
    "North Branch",
  ]);
  await connection.execute("INSERT INTO branches (name) VALUES (?)", [
    "South Branch",
  ]);
  console.log("Branches created");

  // Insert users
  const ownerPassword = await bcrypt.hash("admin123", 10);
  await connection.execute(
    "INSERT INTO users (email, password_hash, role, branch_id) VALUES (?, ?, ?, ?)",
    ["owner@vernie.com", ownerPassword, "owner", null],
  );

  const cashierPassword = await bcrypt.hash("cashier123", 10);
  await connection.execute(
    "INSERT INTO users (email, password_hash, role, branch_id) VALUES (?, ?, ?, ?)",
    ["cashier1@vernie.com", cashierPassword, "cashier", 1],
  );

  const adminPassword = await bcrypt.hash("admin123", 10);
  await connection.execute(
    "INSERT INTO users (email, password_hash, role, branch_id) VALUES (?, ?, ?, ?)",
    ["admin1@vernie.com", adminPassword, "branch_admin", 1],
  );
  console.log("Users created");

  // Insert products
  await connection.execute(
    "INSERT INTO products (name, description, price) VALUES (?, ?, ?)",
    ["T-Shirt", "Cotton T-Shirt", 19.99],
  );
  await connection.execute(
    "INSERT INTO products (name, description, price) VALUES (?, ?, ?)",
    ["Jeans", "Denim Jeans", 49.99],
  );
  await connection.execute(
    "INSERT INTO products (name, description, price) VALUES (?, ?, ?)",
    ["Sneakers", "Running Shoes", 79.99],
  );
  await connection.execute(
    "INSERT INTO products (name, description, price) VALUES (?, ?, ?)",
    ["Backpack", "School Backpack", 29.99],
  );
  await connection.execute(
    "INSERT INTO products (name, description, price) VALUES (?, ?, ?)",
    ["Watch", "Digital Watch", 99.99],
  );
  console.log("Products created");

  // Insert inventory
  const [products] = await connection.execute("SELECT id FROM products");
  const [branches] = await connection.execute("SELECT id FROM branches");

  for (const product of products) {
    for (const branch of branches) {
      const stock = Math.floor(Math.random() * 50) + 10;
      await connection.execute(
        "INSERT INTO inventory (product_id, branch_id, stock) VALUES (?, ?, ?)",
        [product.id, branch.id, stock],
      );
    }
  }
  console.log("Inventory created");

  console.log("\n=== Demo Accounts ===");
  console.log("Owner: owner@vernie.com / admin123");
  console.log("Admin: admin1@vernie.com / admin123");
  console.log("Cashier: cashier1@vernie.com / cashier123");
}

// Run the setup
setupDatabase();
