<?php
require_once 'db.php';

$category = $_GET['category'] ?? '';

if (!$category) {
    sendResponse(["status" => "error", "message" => "Category is required."], 400);
}

try {
    // 1. Get all products in the category
    $stmtProds = $pdo->prepare("SELECT id, name, sku, category, initialStock, initialStockDate, costPrice, stock FROM products WHERE category = ? AND (status != 'INACTIVE' OR status IS NULL)");
    $stmtProds->execute([$category]);
    $products = $stmtProds->fetchAll();

    if (empty($products)) {
        sendResponse(["status" => "success", "summary" => []]);
        exit;
    }

    $productIds = array_column($products, 'id');
    $placeholders = implode(',', array_fill(0, count($productIds), '?'));

    // 2. Sum up Orders (Incoming)
    $stmtOrders = $pdo->prepare("
        SELECT i.productId, SUM(i.quantity) as total_in
        FROM order_items i
        JOIN orders o ON i.orderId = o.id
        WHERE i.productId IN ($placeholders) AND o.status = 'RECEIVED'
        GROUP BY i.productId
    ");
    $stmtOrders->execute($productIds);
    $ordersMap = [];
    foreach ($stmtOrders->fetchAll() as $row) {
        $ordersMap[$row['productId']] = (int)$row['total_in'];
    }

    // 3. Sum up Sales (Outgoing)
    $stmtSales = $pdo->prepare("
        SELECT i.productId, SUM(i.quantity) as total_out
        FROM transaction_items i
        JOIN transactions t ON i.transactionId = t.id
        WHERE i.productId IN ($placeholders) AND t.status != 'CANCELLED'
        GROUP BY i.productId
    ");
    $stmtSales->execute($productIds);
    $salesMap = [];
    foreach ($stmtSales->fetchAll() as $row) {
        $salesMap[$row['productId']] = (int)$row['total_out'];
    }

    // 4. Sum up Adjustments
    $stmtAdj = $pdo->prepare("
        SELECT productId, type, quantity, status
        FROM stock_adjustments
        WHERE productId IN ($placeholders) AND status != 'CANCELLED' AND status != 'PENDING'
    ");
    $stmtAdj->execute($productIds);
    $adjMap = [];
    foreach ($stmtAdj->fetchAll() as $row) {
        $pid = $row['productId'];
        $isAddition = ($row['type'] === 'IN' || $row['type'] === 'RESTOCK' || $row['type'] === 'RETURN');
        $qty = (int)$row['quantity'];
        if (!isset($adjMap[$pid])) $adjMap[$pid] = 0;
        $adjMap[$pid] += $isAddition ? $qty : -$qty;
    }

    // 5. Build Final Summary
    $summary = [];
    foreach ($products as $p) {
        $pid = $p['id'];
        $orders = $ordersMap[$pid] ?? 0;
        $sales = $salesMap[$pid] ?? 0;
        $adjustments = $adjMap[$pid] ?? 0;
        $initial = (int)$p['initialStock'];
        
        // Final stock calculated from audit trail
        $calculatedStock = $initial + $orders - $sales + $adjustments;
        
        $summary[] = [
            'sku' => $p['sku'],
            'name' => $p['name'],
            'initialStock' => $initial,
            'totalIn' => $orders,
            'totalOut' => $sales,
            'adjustment' => $adjustments,
            'calculatedStock' => $calculatedStock,
            'currentStock' => (int)$p['stock'], // Value in database
            'costPrice' => (float)$p['costPrice'],
            'stockValue' => $calculatedStock * (float)$p['costPrice']
        ];
    }

    sendResponse([
        "status" => "success",
        "category" => $category,
        "summary" => $summary
    ]);

} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
