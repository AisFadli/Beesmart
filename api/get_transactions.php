<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR', 'MEMBER']);

$startDate = (string)($_GET['startDate'] ?? date('Y-m-d', strtotime('-30 days')));
$endDate = (string)($_GET['endDate'] ?? date('Y-m-d'));
$page = min(10000, max(1, (int)($_GET['page'] ?? 1)));
$limit = min(100, max(1, (int)($_GET['limit'] ?? 50)));
$offset = ($page - 1) * $limit;
$search = $_GET['search'] ?? '';
$role = strtoupper($auth['role'] ?? '');
$userId = (string)($auth['uid'] ?? '');

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) || $startDate > $endDate) {
    sendResponse(["status" => "error", "message" => "Rentang tanggal tidak valid."], 400);
}

try {
    $tenantCategoriesUpper = [];
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
                "transactions" => [],
                "totalCount" => 0,
                "totalPages" => 0,
                "currentPage" => $page
            ]);
        }
    }

    $where = "WHERE timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY)";
    $params = [$startDate, $endDate];

    if ($role === 'TENANT' && !empty($tenantCategoriesUpper)) {
        $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
        $where .= " AND EXISTS (SELECT 1 FROM transaction_items ti WHERE ti.transactionId = transactions.id AND UPPER(TRIM(ti.category)) IN ($catPlaceholders))";
        foreach ($tenantCategoriesUpper as $tc) {
            $params[] = $tc;
        }
    }

    if ($role === 'MEMBER') {
        $memberId = preg_replace('/^(USER-|USR-)/i', '', trim($userId));
        $where .= " AND memberId IN (?, ?)";
        $params[] = $userId;
        $params[] = $memberId;
    }

    if (!empty($search)) {
        $where .= " AND (id LIKE ? OR customerName LIKE ? OR EXISTS (SELECT 1 FROM transaction_items WHERE transactionId = transactions.id AND (name LIKE ? OR category LIKE ?)))";
        $s = "%$search%";
        array_push($params, $s, $s, $s, $s);
    }

    $paymentStatus = $_GET['paymentStatus'] ?? '';
    if (!empty($paymentStatus)) {
        $where .= " AND paymentStatus = ?";
        array_push($params, $paymentStatus);
    }

    $transactionType = $_GET['transactionType'] ?? '';
    if (!empty($transactionType)) {
        $where .= " AND transactionType = ?";
        array_push($params, $transactionType);
    }

    $paymentMethod = $_GET['paymentMethod'] ?? '';
    if (!empty($paymentMethod)) {
        $where .= " AND paymentMethod = ?";
        array_push($params, $paymentMethod);
    }

    // Get total count
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM transactions $where");
    $stmt->execute($params);
    $totalCount = (int)$stmt->fetchColumn();

    // Get paginated transactions
    $stmt = $pdo->prepare("SELECT * FROM transactions $where ORDER BY timestamp DESC LIMIT $limit OFFSET $offset");
    $stmt->execute($params);
    $txs = $stmt->fetchAll();

    foreach ($txs as &$tx) {
        $tx['timestamp'] = str_replace(' ', 'T', $tx['timestamp']);
        
        if ($role === 'TENANT' && !empty($tenantCategoriesUpper)) {
            $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
            $stmt = $pdo->prepare("SELECT * FROM transaction_items WHERE transactionId = ? AND UPPER(TRIM(category)) IN ($catPlaceholders)");
            $stmt->execute(array_merge([$tx['id']], $tenantCategoriesUpper));
        } else {
            $stmt = $pdo->prepare("SELECT * FROM transaction_items WHERE transactionId = ?");
            $stmt->execute([$tx['id']]);
        }
        
        $items = $stmt->fetchAll();
        $calcTotal = 0;
        foreach ($items as &$item) {
            $item['quantity'] = (int)$item['quantity'];
            $item['price'] = (float)$item['price'];
            $item['costPrice'] = (float)$item['costPrice'];
            $item['subtotal'] = (float)$item['subtotal'];
            $calcTotal += $item['subtotal'];
        }
        $tx['items'] = $items;
        if ($role === 'TENANT') {
            $tx['total'] = $calcTotal;
            $tx['shippingCost'] = 0;
        } else {
            $tx['total'] = (float)$tx['total'];
        }
    }

    sendResponse([
        "transactions" => $txs,
        "totalCount" => $totalCount,
        "totalPages" => ceil($totalCount / $limit),
        "currentPage" => $page
    ]);
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
