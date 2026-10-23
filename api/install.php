
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
            email VARCHAR(100) DEFAULT NULL,
            address TEXT,
            password VARCHAR(255),
            whatsapp VARCHAR(20) DEFAULT NULL,
            registrationDate DATETIME NOT NULL,
            depositBalance DECIMAL(15,2) DEFAULT 0,
            status VARCHAR(20) DEFAULT 'PENDING',
            memberType VARCHAR(20) DEFAULT 'ADULT',
            nis VARCHAR(50) DEFAULT NULL,
            nisn VARCHAR(50) DEFAULT NULL,
            className VARCHAR(100) DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS member_guardians (
            id INT AUTO_INCREMENT PRIMARY KEY,
            parentMemberId VARCHAR(50) NOT NULL,
            childMemberId VARCHAR(50) NOT NULL,
            relationship VARCHAR(30) DEFAULT 'PARENT',
            status VARCHAR(20) DEFAULT 'ACTIVE',
            createdBy VARCHAR(50) DEFAULT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_guardian_child (parentMemberId, childMemberId),
            KEY idx_guardian_child (childMemberId),
            FOREIGN KEY (parentMemberId) REFERENCES members(id) ON DELETE CASCADE,
            FOREIGN KEY (childMemberId) REFERENCES members(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS member_invitations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            memberId VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL,
            tokenHash CHAR(64) NOT NULL UNIQUE,
            expiresAt DATETIME NOT NULL,
            usedAt DATETIME DEFAULT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_invitation_member (memberId),
            FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS deposit_transfers (
            id VARCHAR(50) PRIMARY KEY,
            fromMemberId VARCHAR(50) NOT NULL,
            toMemberId VARCHAR(50) NOT NULL,
            amount DECIMAL(15,2) NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_transfer_from (fromMemberId, createdAt),
            KEY idx_transfer_to (toMemberId, createdAt),
            FOREIGN KEY (fromMemberId) REFERENCES members(id),
            FOREIGN KEY (toMemberId) REFERENCES members(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS member_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            memberId VARCHAR(50),
            type VARCHAR(20),
            amount DECIMAL(15,2),
            transferId VARCHAR(50) DEFAULT NULL,
            timestamp DATETIME,
            notes TEXT,
            status VARCHAR(20) DEFAULT 'APPROVED',
            proof_image LONGTEXT,
            topupMethod VARCHAR(20) DEFAULT NULL,
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
            indentStatus VARCHAR(20) DEFAULT 'INACTIVE',
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
        CREATE TABLE IF NOT EXISTS service_offerings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            service_type VARCHAR(50) NOT NULL,
            vendor_or_fleet VARCHAR(100) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url VARCHAR(255),
            menu_or_facilities TEXT,
            status VARCHAR(20) DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS service_tariffs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            service_type VARCHAR(50) NOT NULL,
            category_key VARCHAR(100) NOT NULL,
            sub_category VARCHAR(100) NOT NULL,
            price DECIMAL(15,2) NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS service_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            member_id VARCHAR(50) NOT NULL,
            member_name VARCHAR(255) NOT NULL,
            class_name VARCHAR(100),
            address TEXT NOT NULL,
            phone VARCHAR(50) NOT NULL,
            service_type VARCHAR(50) NOT NULL,
            sub_category VARCHAR(100),
            vendor_name VARCHAR(100),
            target_month VARCHAR(50) NOT NULL,
            status VARCHAR(30) DEFAULT 'PENDING',
            assigned_wilayah VARCHAR(50),
            effective_days INT DEFAULT 0,
            final_amount DECIMAL(15,2) DEFAULT 0,
            admin_notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS service_bills (
            id INT AUTO_INCREMENT PRIMARY KEY,
            request_id INT,
            member_id VARCHAR(50) NOT NULL,
            month VARCHAR(50) NOT NULL,
            service_type VARCHAR(50) NOT NULL,
            details TEXT,
            amount DECIMAL(15,2) NOT NULL,
            status VARCHAR(30) DEFAULT 'UNPAID',
            payment_proof VARCHAR(255),
            payment_method VARCHAR(50),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Seed default offering content if empty
    $checkOfferings = $pdo->query("SELECT COUNT(*) FROM service_offerings")->fetchColumn();
    if ($checkOfferings == 0) {
        $pdo->exec("INSERT INTO service_offerings (service_type, vendor_or_fleet, title, description, image_url, menu_or_facilities) VALUES 
        ('CATERING', 'Vendor Katering Pawon', 'Paket Kuliner Sehat & Bergizi Pawon', 'Menyediakan hidangan harian higienis dengan bahan-bahan pilihan berkualitas tinggi.', '/app/logo/catering-pawon.jpg', 'Menu Andalan: Ayam Teriyaki, Sop Buntut Sapi, Cah Broccoli Tahu, Buah Segar.'),
        ('CATERING', 'Vendor Royal', 'Royal Catering - Cita Rasa Resto', 'Menu masakan nusantara dan western dengan porsi mengenyangkan dan rasa premium.', '/app/logo/catering-royal.jpg', 'Menu Andalan: Beef Blackpepper, Sup Asparagus, Capcay Seafood, Pudding.'),
        ('CATERING', 'Vendor Dapoer Koperasi', 'Dapoer Koperasi - Selera Rumahan', 'Masakan rumahan autentik yang lezat, bersih, dan ramah di kantong siswa.', '/app/logo/catering-koperasi.jpg', 'Menu Andalan: Nasi Bakar Cakalang, Pecel Lele Sehat, Tumis Kangkung, Tempe Mendoan.'),
        ('TRANSPORT', 'Armada Hiace / Elf Executive', 'Armada Jemputan AC Eksekutif', 'Kendaraan antar-jemput ber-AC dingin, kursi nyaman, sabuk pengaman, dan driver profesional berpengalaman.', '/app/logo/fleet-hiace.jpg', 'Fasilitas: Full AC, Seat Belt Individual, GPS Tracking, Driver Ramah & Tepat Waktu.')");
    }

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
