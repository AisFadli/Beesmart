<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}

try {
    $pdo->beginTransaction();

    $products = $pdo->query("SELECT id, stock, initialStock, initialStockDate FROM products WHERE COALESCE(status, '') != 'INACTIVE' FOR UPDATE")->fetchAll();
    if (!$products) {
        $pdo->commit();
        sendResponse(["status" => "success", "reconciledCount" => 0, "totalDifference" => 0, "message" => "Tidak ada produk aktif untuk disinkronkan."]);
    }

    $orderRows = $pdo->query("SELECT i.productId, SUM(i.quantity) AS total FROM order_items i JOIN orders o ON o.id = i.orderId JOIN products p ON p.id = i.productId WHERE COALESCE(p.status, '') != 'INACTIVE' AND o.status = 'RECEIVED' GROUP BY i.productId")->fetchAll();
    $salesRows = $pdo->query("SELECT i.productId, SUM(i.quantity) AS total FROM transaction_items i JOIN transactions t ON t.id = i.transactionId JOIN products p ON p.id = i.productId WHERE COALESCE(p.status, '') != 'INACTIVE' AND (t.status IS NULL OR t.status NOT IN ('CANCELLED', 'PENDING', 'INACTIVE')) GROUP BY i.productId")->fetchAll();
    $adjustmentRows = $pdo->query("SELECT sa.productId, SUM(CASE WHEN sa.type IN ('IN', 'RESTOCK', 'RETURN') THEN sa.quantity ELSE -sa.quantity END) AS total FROM stock_adjustments sa JOIN products p ON p.id = sa.productId WHERE COALESCE(p.status, '') != 'INACTIVE' AND (sa.status IS NULL OR sa.status NOT IN ('CANCELLED', 'PENDING')) GROUP BY sa.productId")->fetchAll();

    $ordersByProduct = [];
    foreach ($orderRows as $row) $ordersByProduct[$row['productId']] = (int)$row['total'];
    $salesByProduct = [];
    foreach ($salesRows as $row) $salesByProduct[$row['productId']] = (int)$row['total'];
    $adjustmentsByProduct = [];
    foreach ($adjustmentRows as $row) $adjustmentsByProduct[$row['productId']] = (int)$row['total'];

    $insertAdjustment = $pdo->prepare("INSERT INTO stock_adjustments (productId, quantity, type, timestamp, staffId, notes, status) VALUES (?, ?, ?, ?, ?, ?, 'NORMAL')");

    $timestamp = date('Y-m-d H:i:s');
    $dateLabel = date('Y-m-d');
    $reconciled = 0;
    $totalDifference = 0;

    foreach ($products as $product) {
        $productId = $product['id'];
        $orders = $ordersByProduct[$productId] ?? 0;
        $sales = $salesByProduct[$productId] ?? 0;
        $adjustments = $adjustmentsByProduct[$productId] ?? 0;

        $initial = !empty($product['initialStockDate']) ? (int)$product['initialStock'] : 0;
        $auditStock = $initial + $orders - $sales + $adjustments;
        $difference = (int)$product['stock'] - $auditStock;
        if ($difference === 0) {
            continue;
        }

        $insertAdjustment->execute([
            $productId,
            abs($difference),
            $difference > 0 ? 'IN' : 'DAMAGE',
            $timestamp,
            $auth['uid'] ?? 'SYSTEM',
            "Sinkronisasi stok audit per {$dateLabel}; disesuaikan dengan stok aktual inventory."
        ]);

        $reconciled++;
        $totalDifference += $difference;
    }

    $pdo->commit();
    sendResponse([
        "status" => "success",
        "reconciledCount" => $reconciled,
        "totalDifference" => $totalDifference,
        "message" => $reconciled > 0 ? "Penyesuaian audit stok berhasil dicatat." : "Semua stok audit sudah sesuai dengan inventory."
    ]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}