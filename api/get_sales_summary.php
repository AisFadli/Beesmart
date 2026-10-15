<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR', 'MEMBER']);

$startDate = (string)($_GET['startDate'] ?? date('Y-m-d', strtotime('-30 days')));
$endDate = (string)($_GET['endDate'] ?? date('Y-m-d'));
$role = strtoupper($auth['role'] ?? '');
$userId = (string)($auth['uid'] ?? '');

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) || $startDate > $endDate) {
    sendResponse(["status" => "error", "message" => "Rentang tanggal tidak valid."], 400);
}

try {
    $tenantCategoriesUpper = [];
    if ($role === 'MEMBER') {
        $memberId = preg_replace('/^(USER-|USR-)/i', '', trim($userId));
        $dateParams = [$startDate, $endDate, $userId, $memberId];

        $stmt = $pdo->prepare("SELECT COALESCE(SUM(total), 0) FROM transactions WHERE paymentStatus = 'PAID' AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND memberId IN (?, ?)");
        $stmt->execute($dateParams);
        $revenue = (float)$stmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT COALESCE(SUM(ti.quantity * ti.costPrice), 0) FROM transaction_items ti JOIN transactions t ON ti.transactionId = t.id WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND t.memberId IN (?, ?)");
        $stmt->execute($dateParams);
        $cost = (float)$stmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE paymentStatus = 'UNPAID' AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND memberId IN (?, ?)");
        $stmt->execute($dateParams);
        $unpaid = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE transactionType = 'INDENT' AND receivedAt IS NULL AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND memberId IN (?, ?)");
        $stmt->execute($dateParams);
        $indent = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT ti.category, SUM(ti.subtotal) AS total, SUM(ti.quantity * ti.costPrice) AS cost FROM transaction_items ti JOIN transactions t ON ti.transactionId = t.id WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND t.memberId IN (?, ?) GROUP BY ti.category ORDER BY total DESC");
        $stmt->execute($dateParams);
        $byCategory = $stmt->fetchAll();

        $stmt = $pdo->prepare("SELECT paymentMethod, SUM(total) AS total FROM transactions WHERE paymentStatus = 'PAID' AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND memberId IN (?, ?) GROUP BY paymentMethod");
        $stmt->execute($dateParams);
        $byPaymentMethod = $stmt->fetchAll();

        sendResponse([
            "revenue" => $revenue,
            "cost" => $cost,
            "profit" => $revenue - $cost,
            "unpaidCount" => $unpaid,
            "indentCount" => $indent,
            "byCategory" => $byCategory,
            "byPaymentMethod" => $byPaymentMethod
        ]);
    }

    if ($role === 'TENANT') {
        if (!empty($userId)) {
            $uStmt = $pdo->prepare("SELECT tenantCategories FROM users WHERE (id = ? OR email = ?) AND status = 'ACTIVE' LIMIT 1");
            $uStmt->execute([$userId, $userId]);
            $uRow = $uStmt->fetch();
            if ($uRow && !empty($uRow['tenantCategories'])) {
                $rawCats = is_array($uRow['tenantCategories']) ? $uRow['tenantCategories'] : (json_decode($uRow['tenantCategories'], true) ?? []);
                $tenantCategoriesUpper = array_values(array_filter(array_map(function($c) { return strtoupper(trim($c)); }, $rawCats)));
            }
        }

        if (empty($tenantCategoriesUpper)) {
            sendResponse([
                "revenue" => 0,
                "cost" => 0,
                "profit" => 0,
                "unpaidCount" => 0,
                "indentCount" => 0,
                "byCategory" => [],
                "byPaymentMethod" => []
            ]);
        }

        $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
        $dateParams = [$startDate, $endDate];
        $allParams = array_merge($dateParams, $tenantCategoriesUpper);

        // Total Omzet (Revenue for tenant's categories only)
        $stmt = $pdo->prepare("SELECT SUM(ti.subtotal) as totalRevenue 
                               FROM transaction_items ti 
                               JOIN transactions t ON ti.transactionId = t.id 
                               WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND UPPER(TRIM(ti.category)) IN ($catPlaceholders)");
        $stmt->execute($allParams);
        $revenue = (float)($stmt->fetch()['totalRevenue'] ?? 0);

        // Total Cost (HPP for tenant's categories only)
        $stmt = $pdo->prepare("SELECT SUM(ti.quantity * ti.costPrice) as totalCost 
                               FROM transaction_items ti 
                               JOIN transactions t ON ti.transactionId = t.id 
                               WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND UPPER(TRIM(ti.category)) IN ($catPlaceholders)");
        $stmt->execute($allParams);
        $cost = (float)($stmt->fetch()['totalCost'] ?? 0);

        // Total Piutang (Unpaid count for tenant's categories only)
        $stmt = $pdo->prepare("SELECT COUNT(DISTINCT t.id) as unpaidCount 
                               FROM transactions t 
                               JOIN transaction_items ti ON t.id = ti.transactionId 
                               WHERE t.paymentStatus = 'UNPAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND UPPER(TRIM(ti.category)) IN ($catPlaceholders)");
        $stmt->execute($allParams);
        $unpaid = (int)($stmt->fetch()['unpaidCount'] ?? 0);

        // Total Indent (Active indent transactions for tenant's categories only)
        $stmt = $pdo->prepare("SELECT COUNT(DISTINCT t.id) as indentCount 
                               FROM transactions t 
                               JOIN transaction_items ti ON t.id = ti.transactionId 
                               WHERE t.transactionType = 'INDENT' AND t.receivedAt IS NULL AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND UPPER(TRIM(ti.category)) IN ($catPlaceholders)");
        $stmt->execute($allParams);
        $indent = (int)($stmt->fetch()['indentCount'] ?? 0);

        // Sales by Category
        $stmt = $pdo->prepare("SELECT ti.category, SUM(ti.subtotal) as total, SUM(ti.quantity * ti.costPrice) as cost
                               FROM transaction_items ti 
                               JOIN transactions t ON ti.transactionId = t.id 
                               WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND UPPER(TRIM(ti.category)) IN ($catPlaceholders)
                               GROUP BY ti.category 
                               ORDER BY total DESC");
        $stmt->execute($allParams);
        $byCategory = $stmt->fetchAll();

        // Sales by Payment Method
        $stmt = $pdo->prepare("SELECT t.paymentMethod, SUM(ti.subtotal) as total 
                               FROM transaction_items ti 
                               JOIN transactions t ON ti.transactionId = t.id 
                               WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY) AND UPPER(TRIM(ti.category)) IN ($catPlaceholders)
                               GROUP BY t.paymentMethod");
        $stmt->execute($allParams);
        $byPaymentMethod = $stmt->fetchAll();

        sendResponse([
            "revenue" => $revenue,
            "cost" => $cost,
            "profit" => $revenue - $cost,
            "unpaidCount" => $unpaid,
            "indentCount" => $indent,
            "byCategory" => $byCategory,
            "byPaymentMethod" => $byPaymentMethod
        ]);
    }

    // Default for ADMIN & STAFF:
    // Total Omzet (Revenue)
    $stmt = $pdo->prepare("SELECT SUM(total) as totalRevenue FROM transactions WHERE paymentStatus = 'PAID' AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY)");
    $stmt->execute([$startDate, $endDate]);
    $revenue = (float)$stmt->fetch()['totalRevenue'];

    // Total Cost (HPP)
    $stmt = $pdo->prepare("SELECT SUM(ti.quantity * ti.costPrice) as totalCost 
                           FROM transaction_items ti 
                           JOIN transactions t ON ti.transactionId = t.id 
                           WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY)");
    $stmt->execute([$startDate, $endDate]);
    $cost = (float)$stmt->fetch()['totalCost'];

    // Total Piutang (Unpaid count)
    $stmt = $pdo->prepare("SELECT COUNT(*) as unpaidCount FROM transactions WHERE paymentStatus = 'UNPAID' AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY)");
    $stmt->execute([$startDate, $endDate]);
    $unpaid = (int)$stmt->fetch()['unpaidCount'];

    // Total Indent (Active indent transactions)
    $stmt = $pdo->prepare("SELECT COUNT(*) as indentCount FROM transactions WHERE transactionType = 'INDENT' AND receivedAt IS NULL AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY)");
    $stmt->execute([$startDate, $endDate]);
    $indent = (int)$stmt->fetch()['indentCount'];

    // Sales by Category (including HPP)
    $stmt = $pdo->prepare("SELECT ti.category, SUM(ti.subtotal) as total, SUM(ti.quantity * ti.costPrice) as cost
                           FROM transaction_items ti 
                           JOIN transactions t ON ti.transactionId = t.id 
                           WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY)
                           GROUP BY ti.category 
                           ORDER BY total DESC");
    $stmt->execute([$startDate, $endDate]);
    $byCategory = $stmt->fetchAll();

    // Hitung Total Ongkos Kirim sebagai kategori virtual
    $stmtShipping = $pdo->prepare("SELECT SUM(shippingCost) as totalShipping FROM transactions WHERE paymentStatus = 'PAID' AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY)");
    $stmtShipping->execute([$startDate, $endDate]);
    $totalShipping = (float)$stmtShipping->fetch()['totalShipping'];
    
    if ($totalShipping > 0) {
        $byCategory[] = [
            "category" => "JASA KIRIM",
            "total" => $totalShipping,
            "cost" => 0 // Ongkir tidak ada HPP produk
        ];
        // Sort ulang agar tetap rapi
        usort($byCategory, function($a, $b) { return $b['total'] - $a['total']; });
    }

    // Sales by Payment Method
    $stmt = $pdo->prepare("SELECT paymentMethod, SUM(total) as total 
                           FROM transactions 
                           WHERE paymentStatus = 'PAID' AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY)
                           GROUP BY paymentMethod");
    $stmt->execute([$startDate, $endDate]);
    $byPaymentMethod = $stmt->fetchAll();

    sendResponse([
        "revenue" => $revenue,
        "cost" => $cost,
        "profit" => $revenue - $cost,
        "unpaidCount" => $unpaid,
        "indentCount" => $indent,
        "byCategory" => $byCategory,
        "byPaymentMethod" => $byPaymentMethod
    ]);
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
