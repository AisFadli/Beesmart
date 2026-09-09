<?php
require_once 'db.php';

$startDate = $_GET['startDate'] ?? date('Y-m-d', strtotime('-30 days'));
$endDate = $_GET['endDate'] ?? date('Y-m-d');
$search = $_GET['search'] ?? '';

try {
    $where = "WHERE DATE(t.timestamp) BETWEEN ? AND ?";
    $params = [$startDate, $endDate];

    if (!empty($search)) {
        $where .= " AND (t.id LIKE ? OR t.customerName LIKE ? OR EXISTS (SELECT 1 FROM transaction_items WHERE transactionId = t.id AND (name LIKE ? OR category LIKE ?)))";
        $s = "%$search%";
        array_push($params, $s, $s, $s, $s);
    }

    $paymentMethod = $_GET['paymentMethod'] ?? '';
    if (!empty($paymentMethod)) {
        $where .= " AND t.paymentMethod = ?";
        array_push($params, $paymentMethod);
    }

    // Join transactions and items to get all rows for export
    // Ditambah UNION untuk menyertakan Ongkos Kirim sebagai baris item tersendiri
    $query = "
        SELECT * FROM (
            SELECT t.timestamp, t.id as transactionId, t.customerName, ti.name as productName, ti.sku, ti.category, ti.quantity, ti.price, ti.subtotal, ti.costPrice, (ti.costPrice * ti.quantity) as totalHpp, t.staffId, t.status, t.paymentMethod, t.notes 
            FROM transactions t
            JOIN transaction_items ti ON t.id = ti.transactionId
            $where
            
            UNION ALL
            
            SELECT t.timestamp, t.id as transactionId, t.customerName, 'ONGKOS KIRIM' as productName, '-' as sku, 'JASA KIRIM' as category, 1 as quantity, t.shippingCost as price, t.shippingCost as subtotal, 0 as costPrice, 0 as totalHpp, t.staffId, t.status, t.paymentMethod, t.notes 
            FROM transactions t
            $where AND t.shippingCost > 0
        ) combined
        ORDER BY timestamp DESC";
              
    // Karena ada dua $where dalam satu query (UNION), params harus diduplikasi
    $allParams = array_merge($params, $params);
    $stmt = $pdo->prepare($query);
    $stmt->execute($allParams);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    sendResponse($rows);
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
