
<?php
// KEAMANAN: Blokir akses langsung file ini via HTTP
if (isset($_SERVER['REQUEST_METHOD']) && ($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Forbidden');
}

require_once 'db.php';

try {
    // REMOVED: DROP TABLE logic to prevent data loss
    
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(50) PRIMARY KEY,
            email VARCHAR(100) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            role VARCHAR(20) NOT NULL,
            password VARCHAR(255) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS members (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            address TEXT,
            password VARCHAR(255),
            whatsapp VARCHAR(20) NOT NULL,
            registrationDate DATETIME NOT NULL,
            depositBalance DECIMAL(15,2) DEFAULT 0,
            status VARCHAR(20) DEFAULT 'PENDING'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS member_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            memberId VARCHAR(50),
            type VARCHAR(20),
            amount DECIMAL(15,2),
            timestamp DATETIME,
            notes TEXT,
            status VARCHAR(20) DEFAULT 'APPROVED',
            proof_image LONGTEXT,
            FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS products (
            id VARCHAR(50) PRIMARY KEY,
            sku VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(100),
            price DECIMAL(15,2) DEFAULT 0,
            costPrice DECIMAL(15,2) DEFAULT 0,
            stock INT DEFAULT 0,
            initialStock INT DEFAULT 0,
            minStock INT DEFAULT 5,
            image LONGTEXT,
            initialStockDate DATETIME,
            discountValue DECIMAL(15,2) DEFAULT 0,
            discountType VARCHAR(20) DEFAULT 'FIXED',
            discountStart DATETIME,
            discountEnd DATETIME,
            status VARCHAR(20) DEFAULT 'ACTIVE'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS stock_adjustments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            productId VARCHAR(50),
            quantity INT NOT NULL,
            type VARCHAR(20) NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            staffId VARCHAR(100),
            notes TEXT,
            status VARCHAR(20) DEFAULT 'NORMAL',
            FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS product_proposals (
            id INT AUTO_INCREMENT PRIMARY KEY,
            productId VARCHAR(50),
            type VARCHAR(20) DEFAULT 'UPDATE',
            data LONGTEXT,
            staffId VARCHAR(100),
            status VARCHAR(20) DEFAULT 'PENDING',
            reason TEXT,
            adminNote TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS categories (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            status VARCHAR(20) DEFAULT 'ACTIVE'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS orders (
            id VARCHAR(50) PRIMARY KEY,
            staffId VARCHAR(100),
            status VARCHAR(20) DEFAULT 'ACTIVE',
            totalCost DECIMAL(15,2),
            createdAt DATETIME,
            approvedAt DATETIME,
            receivedAt DATETIME,
            notes TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            orderId VARCHAR(50),
            productId VARCHAR(50),
            name VARCHAR(255),
            quantity INT,
            estimatedCost DECIMAL(15,2),
            subtotal DECIMAL(15,2),
            FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS transactions (
            id VARCHAR(50) PRIMARY KEY,
            timestamp DATETIME NOT NULL,
            total DECIMAL(15,2) NOT NULL,
            paidAmount DECIMAL(15,2) DEFAULT 0,
            changeAmount DECIMAL(15,2) DEFAULT 0,
            paymentMethod VARCHAR(20) NOT NULL,
            paymentStatus VARCHAR(20) DEFAULT 'PAID',
            status VARCHAR(20) DEFAULT 'ACTIVE',
            staffId VARCHAR(100),
            memberId VARCHAR(50),
            customerName VARCHAR(100),
            notes TEXT,
            FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS transaction_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transactionId VARCHAR(50),
            productId VARCHAR(50),
            name VARCHAR(255),
            category VARCHAR(100),
            quantity INT,
            price DECIMAL(15,2),
            costPrice DECIMAL(15,2),
            subtotal DECIMAL(15,2),
            FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS settings (
            setting_key VARCHAR(50) PRIMARY KEY,
            setting_value TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS activity_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            staff_name VARCHAR(100),
            menu_category VARCHAR(50),
            action_type VARCHAR(20),
            entity_id VARCHAR(50),
            before_data LONGTEXT,
            after_data LONGTEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Check if admin exists before inserting
    $checkAdmin = $pdo->prepare("SELECT COUNT(*) FROM users WHERE email = ?");
    $checkAdmin->execute(['user@beesmart.store']);
    if ($checkAdmin->fetchColumn() == 0) {
        $hashedPassword = password_hash('admin123', PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("INSERT INTO users (id, email, name, role, password, status) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute(['admin-1', 'user@beesmart.store', 'Administrator', 'ADMIN', $hashedPassword, 'ACTIVE']);
    }
    
    // Check if general category exists
    $checkCat = $pdo->prepare("SELECT COUNT(*) FROM categories WHERE id = ?");
    $checkCat->execute(['cat-1']);
    if ($checkCat->fetchColumn() == 0) {
        $pdo->exec("INSERT INTO categories (id, name) VALUES ('cat-1', 'General')");
    }

    sendResponse(["status" => "success", "message" => "DATABASE UPDATE BERHASIL. Data lama tetap aman."]);
} catch (PDOException $e) {
    sendResponse(["status" => "error", "message" => "Gagal Reset Database: " . $e->getMessage()], 500);
}
