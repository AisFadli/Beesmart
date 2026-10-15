<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'TENANT']);

$productId = $_GET['productId'] ?? '';

if (!$productId) {
    sendResponse(["status" => "error", "message" => "Product ID is required."], 400);
}

try {
    // 1. Get Product Initial Stock
    $stmtProd = $pdo->prepare("SELECT id, name, sku, category, initialStock, initialStockDate, costPrice, status FROM products WHERE id = ?");
    $stmtProd->execute([$productId]);
    $product = $stmtProd->fetch();

    if (!$product) {
        sendResponse(["status" => "error", "message" => "Product not found."], 404);
    }

    if (strtoupper($auth['role'] ?? '') === 'TENANT') {
        $tenantStmt = $pdo->prepare("SELECT tenantCategories FROM users WHERE id = ? AND (status = 'ACTIVE' OR status IS NULL OR status = '') LIMIT 1");
        $tenantStmt->execute([$auth['uid'] ?? '']);
        $tenantRow = $tenantStmt->fetch();
        $tenantCategories = $tenantRow ? (json_decode($tenantRow['tenantCategories'] ?? '[]', true) ?: []) : [];
        $tenantCategories = array_map(function($category) { return strtoupper(trim((string)$category)); }, $tenantCategories);
        if (!in_array(strtoupper(trim((string)$product['category'])), $tenantCategories, true)) {
            sendResponse(["status" => "error", "message" => "Produk berada di luar kategori yang dikelola tenant."], 403);
        }
    }

    $history = [];

    // Add Initial Stock
    if ($product['initialStockDate']) {
        $history[] = [
            'timestamp' => str_replace(' ', 'T', $product['initialStockDate']),
            'ref' => 'STOK-AWAL',
            'type' => 'SALDO AWAL (PEMBUKA)',
            'qty' => (int)$product['initialStock'],
            'staffId' => 'SYSTEM',
            'cost' => (float)$product['costPrice'],
            'status' => $product['status'] ?: 'NORMAL'
        ];
    }

    // 2. Get Stock Entries from Orders (Supply Chain)
    $stmtOrders = $pdo->prepare("
        SELECT o.id, o.createdAt, o.receivedAt, o.staffId, o.status, i.quantity, i.estimatedCost
        FROM orders o
        JOIN order_items i ON o.id = i.orderId
        WHERE i.productId = ? AND o.status = 'RECEIVED'
    ");
    $stmtOrders->execute([$productId]);
    $orders = $stmtOrders->fetchAll();
    foreach ($orders as $o) {
        $history[] = [
            'timestamp' => str_replace(' ', 'T', $o['receivedAt'] ?: $o['createdAt']),
            'ref' => $o['id'],
            'type' => 'STOK MASUK (ORDER)',
            'qty' => (int)$o['quantity'],
            'staffId' => $o['staffId'],
            'cost' => (float)$o['estimatedCost'],
            'status' => 'NORMAL'
        ];
    }

    // 3. Get Stock Out from Transactions (POS Sales)
    // IMPORTANT: Include ALL transactions for this product
    $stmtSales = $pdo->prepare("
        SELECT t.id, t.timestamp, t.staffId, t.status, i.quantity, i.costPrice
        FROM transactions t
        JOIN transaction_items i ON t.id = i.transactionId
        WHERE i.productId = ?
    ");
    $stmtSales->execute([$productId]);
    $sales = $stmtSales->fetchAll();
    foreach ($sales as $s) {
        $history[] = [
            'timestamp' => str_replace(' ', 'T', $s['timestamp']),
            'ref' => $s['id'],
            'type' => 'PENJUALAN POS',
            'qty' => -(int)$s['quantity'],
            'staffId' => $s['staffId'],
            'cost' => (float)$s['costPrice'],
            'status' => $s['status'] ?: 'NORMAL'
        ];
    }

    // 4. Get Stock Adjustments
    $stmtAdj = $pdo->prepare("SELECT * FROM stock_adjustments WHERE productId = ?");
    $stmtAdj->execute([$productId]);
    $adjustments = $stmtAdj->fetchAll();
    foreach ($adjustments as $adj) {
        $isAddition = ($adj['type'] === 'IN' || $adj['type'] === 'RESTOCK' || $adj['type'] === 'RETURN');
        $qty = (int)$adj['quantity'];
        $history[] = [
            'timestamp' => str_replace(' ', 'T', $adj['timestamp']),
            'ref' => 'ADJ-' . $adj['id'],
            'type' => 'PENYESUAIAN (' . $adj['type'] . ')',
            'qty' => $isAddition ? $qty : -$qty,
            'staffId' => $adj['staffId'],
            'cost' => (float)$product['costPrice'],
            'status' => $adj['status'] ?: 'NORMAL'
        ];
    }

    // Sort history by timestamp
    usort($history, function($a, $b) {
        $ta = strtotime($a['timestamp']);
        $tb = strtotime($b['timestamp']);
        if ($ta === $tb) {
            if ($a['ref'] === 'STOK-AWAL') return -1;
            if ($b['ref'] === 'STOK-AWAL') return 1;
        }
        return $ta - $tb;
    });

    // Calculate Running Balance
    $runningBalance = 0;
    foreach ($history as &$h) {
        $effectiveQty = in_array($h['status'], ['CANCELLED', 'PENDING', 'INACTIVE'], true) ? 0 : $h['qty'];
        $runningBalance += $effectiveQty;
        $h['endingBalance'] = $runningBalance;
        $h['date'] = date('d/m/Y', strtotime($h['timestamp']));
    }

    sendResponse([
        "status" => "success",
        "product" => $product,
        "auditData" => $history
    ]);

} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
