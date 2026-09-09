<?php
ob_start();
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(0);

// Set timezone to WIB (Asia/Jakarta)
date_default_timezone_set('Asia/Jakarta');

// Keamanan CORS: Batasi domain yang diizinkan
$allowed_origins = [
    "https://ais-dev-f272xshwuqznj6tit6uhtj-81653062735.asia-east1.run.app",
    "https://ais-pre-f272xshwuqznj6tit6uhtj-81653062735.asia-east1.run.app",
    "https://admin.aiskoperasi.store"
];

if (isset($_SERVER['HTTP_ORIGIN']) && in_array($_SERVER['HTTP_ORIGIN'], $allowed_origins)) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}

header("Access-Control-Allow-Methods: GET, POST, DELETE, PUT, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$host = 'localhost'; 
$db_name = 'Kasir_db'; 
$username = 'Kasir_user';     
$password = 'MASUKKAN_PASSWORD_DB_ANDA_DISINI'; 

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db_name;charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);
    
    // --- CORE SCHEMA INITIALIZATION ---
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100),
        role VARCHAR(20) DEFAULT 'USER',
        status VARCHAR(20) DEFAULT 'ACTIVE',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    try { $pdo->exec("ALTER TABLE users ADD COLUMN email VARCHAR(100) UNIQUE AFTER username"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE users MODIFY COLUMN username VARCHAR(100) NULL"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE users ADD COLUMN tenantCategories LONGTEXT AFTER role"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE' AFTER role"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE users ADD COLUMN createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"); } catch (Exception $e) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE'
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) PRIMARY KEY,
        sku VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(100),
        price DECIMAL(15, 2) DEFAULT 0,
        costPrice DECIMAL(15, 2) DEFAULT 0,
        stock INT DEFAULT 0,
        initialStock INT DEFAULT 0,
        minStock INT DEFAULT 5,
        image LONGTEXT,
        initialStockDate DATETIME DEFAULT NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        discountValue DECIMAL(15, 2) DEFAULT 0,
        discountType VARCHAR(20) DEFAULT 'FIXED',
        discountStart DATETIME DEFAULT NULL,
        discountEnd DATETIME DEFAULT NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS members (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        password VARCHAR(255),
        address TEXT,
        whatsapp VARCHAR(20),
        depositBalance DECIMAL(15, 2) DEFAULT 0,
        registrationDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'APPROVED'
    )");

    // Migration to add missing columns to products table
    try { $pdo->exec("ALTER TABLE products ADD COLUMN barcode VARCHAR(100) AFTER sku"); } catch (Exception $e) {}

    // Migration to add missing columns to members table
    try { $pdo->exec("ALTER TABLE members ADD COLUMN email VARCHAR(100) UNIQUE AFTER name"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE members ADD COLUMN password VARCHAR(255) AFTER email"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE members ADD COLUMN address TEXT AFTER password"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE members ADD COLUMN barcode VARCHAR(100) AFTER id"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE members ADD COLUMN image LONGTEXT AFTER whatsapp"); } catch (Exception $e) {}

    // Auto-populate barcode for products and members if empty
    try { $pdo->exec("UPDATE products SET barcode = sku WHERE barcode IS NULL OR barcode = ''"); } catch (Exception $e) {}
    try { $pdo->exec("UPDATE members SET barcode = CONCAT('MBR-', id) WHERE barcode IS NULL OR barcode = ''"); } catch (Exception $e) {}

    $pdo->exec("CREATE TABLE IF NOT EXISTS member_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        memberId VARCHAR(50),
        type VARCHAR(20),
        amount DECIMAL(15, 2),
        staffId VARCHAR(100),
        status VARCHAR(20) DEFAULT 'APPROVED',
        notes TEXT,
        proof_image LONGTEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS password_resets (
        email VARCHAR(100) NOT NULL,
        token VARCHAR(100) PRIMARY KEY,
        expires_at DATETIME NOT NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        staffId VARCHAR(100),
        status VARCHAR(20) DEFAULT 'PENDING',
        totalCost DECIMAL(15, 2) DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        approvedAt DATETIME DEFAULT NULL,
        receivedAt DATETIME DEFAULT NULL,
        notes TEXT
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        orderId VARCHAR(50),
        productId VARCHAR(50),
        name VARCHAR(255),
        sku VARCHAR(50),
        quantity INT DEFAULT 0,
        estimatedCost DECIMAL(15, 2) DEFAULT 0,
        subtotal DECIMAL(15, 2) DEFAULT 0,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(50) PRIMARY KEY,
        customerName VARCHAR(100),
        items LONGTEXT,
        total DECIMAL(15, 2) NOT NULL,
        paymentMethod VARCHAR(20),
        paymentStatus VARCHAR(20),
        staffId VARCHAR(100),
        memberId VARCHAR(50),
        notes TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'NORMAL',
        receivedAt DATETIME DEFAULT NULL,
        deliveryType VARCHAR(20) DEFAULT 'PICKUP',
        shippingCost DECIMAL(15, 2) DEFAULT 0,
        paymentProof VARCHAR(255) DEFAULT NULL,
        latitude DECIMAL(10, 8) DEFAULT NULL,
        longitude DECIMAL(11, 8) DEFAULT NULL,
        transactionType VARCHAR(20) DEFAULT 'NORMAL',
        orderStatus VARCHAR(20) DEFAULT NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS transaction_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transactionId VARCHAR(50),
        productId VARCHAR(50),
        name VARCHAR(255),
        sku VARCHAR(50),
        category VARCHAR(100),
        quantity INT DEFAULT 0,
        price DECIMAL(15, 2) DEFAULT 0,
        costPrice DECIMAL(15, 2) DEFAULT 0,
        originalPrice DECIMAL(15, 2) DEFAULT 0,
        discountValue DECIMAL(15, 2) DEFAULT 0,
        discountType VARCHAR(20) DEFAULT 'FIXED',
        subtotal DECIMAL(15, 2) DEFAULT 0,
        FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE
    )");

    // Migration to add SKU column if it doesn't exist
    try {
        $pdo->exec("ALTER TABLE transaction_items ADD COLUMN sku VARCHAR(50) AFTER name");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE order_items ADD COLUMN sku VARCHAR(50) AFTER name");
    } catch (Exception $e) {}

    // Populate existing data with SKU
    $pdo->exec("UPDATE transaction_items ti JOIN products p ON ti.productId = p.id SET ti.sku = p.sku WHERE ti.sku IS NULL OR ti.sku = ''");
    $pdo->exec("UPDATE order_items oi JOIN products p ON oi.productId = p.id SET oi.sku = p.sku WHERE oi.sku IS NULL OR oi.sku = ''");

    $pdo->exec("CREATE TABLE IF NOT EXISTS stock_adjustments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productId VARCHAR(50),
        quantity INT NOT NULL,
        type VARCHAR(20),
        staffId VARCHAR(100),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'NORMAL'
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS product_proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productId VARCHAR(50) DEFAULT NULL,
        type VARCHAR(20),
        data LONGTEXT,
        staffId VARCHAR(100),
        reason TEXT,
        status VARCHAR(20) DEFAULT 'PENDING',
        adminNote TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    try {
        $pdo->exec("ALTER TABLE product_proposals MODIFY COLUMN data LONGTEXT");
    } catch (Exception $e) {}

    try {
        $pdo->exec("ALTER TABLE products ADD INDEX idx_status (status)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE products ADD INDEX idx_name (name)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE categories ADD INDEX idx_status (status)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE transaction_items ADD INDEX idx_tx_id (transactionId)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE transaction_items ADD INDEX idx_prod_id (productId)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE transactions ADD INDEX idx_member_id (memberId)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE transactions ADD INDEX idx_status (status)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE transactions ADD INDEX idx_timestamp (timestamp)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE order_items ADD INDEX idx_order_id (orderId)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE members ADD INDEX idx_mbr_status (status)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE members ADD INDEX idx_mbr_barcode (barcode)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE members ADD INDEX idx_mbr_name (name)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE members ADD INDEX idx_mbr_wa (whatsapp)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE member_logs ADD INDEX idx_mlog_member (memberId)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE member_logs ADD INDEX idx_mlog_status (status)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE member_logs ADD INDEX idx_mlog_time (timestamp)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE messages ADD INDEX idx_msg_sender (senderId)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE messages ADD INDEX idx_msg_receiver (receiverId)");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE messages ADD INDEX idx_msg_isread (isRead)");
    } catch (Exception $e) {}

    // Ensure all products have a valid status
    $pdo->exec("UPDATE products SET status = 'ACTIVE' WHERE status IS NULL OR status = ''");
    $pdo->exec("UPDATE categories SET status = 'ACTIVE' WHERE status IS NULL OR status = ''");
    $pdo->exec("UPDATE members SET status = 'APPROVED' WHERE status = 'ACTIVE'");

    // --- END SCHEMA INITIALIZATION ---

    // --- SUPPLEMENTAL SETTINGS & LOGS ---
    $pdo->exec("CREATE TABLE IF NOT EXISTS expenses (
        id VARCHAR(50) PRIMARY KEY,
        date DATE NOT NULL,
        description TEXT,
        category VARCHAR(100),
        amount DECIMAL(15, 2) NOT NULL,
        staffId VARCHAR(100),
        status VARCHAR(20) DEFAULT 'NORMAL',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS shipping_rates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        minDistance DECIMAL(10, 2) NOT NULL,
        maxDistance DECIMAL(10, 2) NOT NULL,
        rate DECIMAL(15, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'ACTIVE'
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value LONGTEXT
    )");
    
    // Ensure LONGTEXT for existing app_settings
    try {
        $pdo->exec("ALTER TABLE app_settings MODIFY COLUMN setting_value LONGTEXT");
    } catch (Exception $e) {}

    // Initialize store location if not exists
    $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM app_settings WHERE setting_key = 'store_location'");
    $stmtCheck->execute();
    if ($stmtCheck->fetchColumn() == 0) {
        $defaultLoc = json_encode(['lat' => -6.200000, 'lng' => 106.816666]); // Default Jakarta
        $pdo->prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES ('store_location', ?)")->execute([$defaultLoc]);
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_name VARCHAR(100),
        menu_category VARCHAR(50),
        action_type VARCHAR(20),
        entity_id VARCHAR(50),
        before_data LONGTEXT,
        after_data LONGTEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        senderId VARCHAR(50) NOT NULL,
        senderRole VARCHAR(20) NOT NULL,
        senderName VARCHAR(100) NOT NULL,
        receiverId VARCHAR(50) NOT NULL,
        receiverRole VARCHAR(20) NOT NULL,
        receiverName VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        isRead INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // --- MIGRATION / SCHEMA UPDATES FOR EXISTING INSTALLS ---
    $tables = [
        'products' => [
            'initialStock' => "INT DEFAULT 0",
            'status' => "VARCHAR(20) DEFAULT 'ACTIVE'",
            'discountValue' => "DECIMAL(15, 2) DEFAULT 0",
            'discountType' => "VARCHAR(20) DEFAULT 'FIXED'",
            'discountStart' => "DATETIME DEFAULT NULL",
            'discountEnd' => "DATETIME DEFAULT NULL"
        ],
        'transactions' => [
            'status' => "VARCHAR(20) DEFAULT 'NORMAL'",
            'receivedAt' => "DATETIME DEFAULT NULL",
            'deliveryType' => "VARCHAR(20) DEFAULT 'PICKUP'",
            'shippingCost' => "DECIMAL(15, 2) DEFAULT 0",
            'paymentProof' => "VARCHAR(255) DEFAULT NULL",
            'latitude' => "DECIMAL(10, 8) DEFAULT NULL",
            'longitude' => "DECIMAL(11, 8) DEFAULT NULL",
            'transactionType' => "VARCHAR(20) DEFAULT 'NORMAL'",
            'memberId' => "VARCHAR(50) AFTER staffId",
            'notes' => "TEXT AFTER memberId",
            'orderStatus' => "VARCHAR(20) DEFAULT NULL"
        ],
        'transaction_items' => [
            'originalPrice' => "DECIMAL(15, 2) DEFAULT 0",
            'discountValue' => "DECIMAL(15, 2) DEFAULT 0",
            'discountType' => "VARCHAR(20) DEFAULT 'FIXED'"
        ],
        'stock_adjustments' => [
            'status' => "VARCHAR(20) DEFAULT 'NORMAL'"
        ],
        'member_logs' => [
            'status' => "VARCHAR(20) DEFAULT 'APPROVED'",
            'notes' => "TEXT AFTER staffId",
            'proof_image' => "LONGTEXT AFTER notes"
        ]
    ];

    foreach ($tables as $t => $cols) {
        foreach ($cols as $col => $def) {
            try {
                $pdo->query("SELECT $col FROM $t LIMIT 1");
            } catch (Exception $e) {
                $pdo->exec("ALTER TABLE $t ADD COLUMN $col $def");
                if ($col === 'initialStock' && $t === 'products') {
                    $pdo->exec("UPDATE products SET initialStock = stock");
                }
            }
        }
    }

    // --- CASE SENSITIVITY MIGRATION (Normalize Categories to UPPERCASE) ---
    // This runs on every load but these are fast indexed updates or no-ops if already uppercase
    try {
        $pdo->exec("UPDATE categories SET name = UPPER(TRIM(name))");
        $pdo->exec("UPDATE products SET category = UPPER(TRIM(category))");
        $pdo->exec("UPDATE expenses SET category = UPPER(TRIM(category))");
        $pdo->exec("UPDATE transaction_items SET category = UPPER(TRIM(category))");
        
        // DEDUPLICATION: Remove duplicate category names in categories table
        // Normalize names to UPPERCASE first
        $pdo->exec("UPDATE categories SET name = UPPER(TRIM(name))");
        $pdo->exec("UPDATE products SET category = UPPER(TRIM(category))");
        $pdo->exec("UPDATE expenses SET category = UPPER(TRIM(category))");
        
        // Remove duplicates after normalization
        $pdo->exec("DELETE c1 FROM categories c1 
                   INNER JOIN categories c2 
                   WHERE c1.id > c2.id AND c1.name = c2.name");
        
        // SETTINGS MIGRATION: Unwrap 'store_profile' if it exists as a nested JSON
        $stmtProf = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'store_profile'");
        $stmtProf->execute();
        $profileJson = $stmtProf->fetchColumn();
        if ($profileJson) {
            $profile = json_decode($profileJson, true);
            if (is_array($profile)) {
                foreach ($profile as $k => $v) {
                    $vStr = is_array($v) ? json_encode($v) : $v;
                    $stmtIns = $pdo->prepare("REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)");
                    $stmtIns->execute([$k, $vStr]);
                }
                // Finally remove the legacy key
                $pdo->exec("DELETE FROM app_settings WHERE setting_key = 'store_profile'");
            }
        }
        
    } catch (Exception $e) {
        error_log("Normalization Migration Failed: " . $e->getMessage());
    }

} catch (PDOException $e) {
    ob_clean();
    http_response_code(500);
    echo json_encode([
        "status" => "error", 
        "message" => "Koneksi Database Gagal: " . $e->getMessage()
    ]);
    exit;
}

/**
 * Log activity for auditing changes/deletes
 */
function logActivity($pdo, $staffName, $menuCategory, $actionType, $entityId, $beforeData = null, $afterData = null) {
    try {
        $stmt = $pdo->prepare("INSERT INTO activity_logs (staff_name, menu_category, action_type, entity_id, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $staffName, 
            $menuCategory, 
            $actionType, 
            $entityId, 
            $beforeData ? json_encode($beforeData) : null, 
            $afterData ? json_encode($afterData) : null
        ]);
    } catch (Exception $e) {
        // Silently fail logging to not block the main operation if log table has issues
        error_log("Failed to log activity: " . $e->getMessage());
    }
}

function sendResponse($data, $status = 200) {
    if (ob_get_length()) ob_clean(); 
    if ($status !== 200) {
        http_response_code($status);
    }
    echo json_encode($data);
    exit;
}