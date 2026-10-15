<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR']);

$startDate = (string)($_GET['startDate'] ?? date('Y-m-d', strtotime('-30 days')));
$endDate = (string)($_GET['endDate'] ?? date('Y-m-d'));
$search = $_GET['search'] ?? '';

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) || $startDate > $endDate) {
    sendResponse(["status" => "error", "message" => "Rentang tanggal tidak valid."], 400);
}

try {
    $whereItems = "WHERE t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY)";
    $whereShipping = $whereItems;
    $params = [$startDate, $endDate];

    if (!empty($search)) {
        $whereItems .= " AND (t.id LIKE ? OR t.customerName LIKE ? OR EXISTS (SELECT 1 FROM transaction_items WHERE transactionId = t.id AND (name LIKE ? OR category LIKE ?)))";
        $whereShipping .= " AND (t.id LIKE ? OR t.customerName LIKE ? OR EXISTS (SELECT 1 FROM transaction_items WHERE transactionId = t.id AND (name LIKE ? OR category LIKE ?)))";
        $s = "%$search%";
        array_push($params, $s, $s, $s, $s);
    }

    $paymentMethod = $_GET['paymentMethod'] ?? '';
    if (!empty($paymentMethod)) {
        $whereItems .= " AND t.paymentMethod = ?";
        $whereShipping .= " AND t.paymentMethod = ?";
        array_push($params, $paymentMethod);
    }

    $role = strtoupper($auth['role'] ?? '');
    $itemParams = $params;
    $shippingParams = $params;
    if ($role === 'TENANT') {
        $stmtTenant = $pdo->prepare("SELECT tenantCategories FROM users WHERE id = ? AND (status = 'ACTIVE' OR status IS NULL OR status = '') LIMIT 1");
        $stmtTenant->execute([$auth['uid'] ?? '']);
        $tenantRow = $stmtTenant->fetch();
        $tenantCategories = $tenantRow ? (json_decode($tenantRow['tenantCategories'] ?? '[]', true) ?: []) : [];
        $tenantCategories = array_values(array_filter(array_map(function($category) { return strtoupper(trim((string)$category)); }, $tenantCategories)));
        if (empty($tenantCategories)) sendResponse([]);

        $categoryPlaceholders = implode(',', array_fill(0, count($tenantCategories), '?'));
        $whereItems .= " AND UPPER(TRIM(ti.category)) IN ($categoryPlaceholders)";
        $whereShipping .= " AND EXISTS (SELECT 1 FROM transaction_items tenant_items WHERE tenant_items.transactionId = t.id AND UPPER(TRIM(tenant_items.category)) IN ($categoryPlaceholders))";
        $itemParams = array_merge($itemParams, $tenantCategories);
        $shippingParams = array_merge($shippingParams, $tenantCategories);
    }

    // Join transactions and items to get all rows for export
    // Ditambah UNION untuk menyertakan Ongkos Kirim sebagai baris item tersendiri
    $query = "
        SELECT * FROM (
            SELECT t.timestamp, t.id as transactionId, t.customerName, ti.name as productName, ti.sku, ti.category, ti.quantity, ti.price, ti.subtotal, ti.costPrice, (ti.costPrice * ti.quantity) as totalHpp, t.staffId, t.status, t.paymentMethod, t.notes 
            FROM transactions t
            JOIN transaction_items ti ON t.id = ti.transactionId
            $whereItems
            
            UNION ALL
            
            SELECT t.timestamp, t.id as transactionId, t.customerName, 'ONGKOS KIRIM' as productName, '-' as sku, 'JASA KIRIM' as category, 1 as quantity, t.shippingCost as price, t.shippingCost as subtotal, 0 as costPrice, 0 as totalHpp, t.staffId, t.status, t.paymentMethod, t.notes 
            FROM transactions t
            $whereShipping AND t.shippingCost > 0
        ) combined
        ORDER BY timestamp DESC";
              
    // Karena ada dua $where dalam satu query (UNION), params harus diduplikasi
    $allParams = array_merge($itemParams, $shippingParams);
    $stmt = $pdo->prepare($query);
    $stmt->execute($allParams);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    sendResponse($rows);
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
