
<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT']);
$authRole = strtoupper($auth['role'] ?? '');

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!is_array($data) || empty($data['id']) || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', (string)$data['id']) || !isset($data['items']) || !is_array($data['items'])) {
        sendResponse(["status" => "error", "message" => "Data order tidak valid."], 400);
    }
    $targetStatus = strtoupper((string)($data['status'] ?? ''));
    if (!in_array($targetStatus, ['PENDING', 'APPROVED', 'RECEIVED', 'DECLINED', 'CANCELLED'], true)) {
        sendResponse(["status" => "error", "message" => "Status order tidak valid."], 400);
    }
    
    try {
        $pdo->beginTransaction();

        // Cek apakah order sudah ada (untuk update status)
        $stmtCheck = $pdo->prepare("SELECT status, totalCost FROM orders WHERE id = ? FOR UPDATE");
        $stmtCheck->execute([$data['id']]);
        $oldOrder = $stmtCheck->fetch();
        $isAdmin = $authRole === 'ADMIN';
        $isReceive = $oldOrder && $oldOrder['status'] === 'APPROVED' && $targetStatus === 'RECEIVED';
        if (!$isAdmin && (($oldOrder && !$isReceive) || (!$oldOrder && $targetStatus !== 'PENDING'))) {
            $pdo->rollBack();
            sendResponse(["status" => "error", "message" => "Transisi status order tidak diizinkan."], 403);
        }

        $normalizedItems = [];
        $computedTotal = 0.0;
        $replaceItems = !$oldOrder || ($isAdmin && $oldOrder['status'] !== 'RECEIVED');
        if ($replaceItems) {
            $tenantCategories = [];
            if ($authRole === 'TENANT') {
                $stmtTenant = $pdo->prepare("SELECT tenantCategories FROM users WHERE id = ? AND (status = 'ACTIVE' OR status IS NULL OR status = '') LIMIT 1");
                $stmtTenant->execute([$auth['uid'] ?? '']);
                $tenantRow = $stmtTenant->fetch();
                $tenantCategories = $tenantRow ? (json_decode($tenantRow['tenantCategories'] ?? '[]', true) ?: []) : [];
                $tenantCategories = array_map(function($category) { return strtoupper(trim((string)$category)); }, $tenantCategories);
            }
            if (count($data['items']) < 1 || count($data['items']) > 100) {
                throw new Exception("Jumlah item order tidak valid.");
            }
            foreach ($data['items'] as $item) {
                if (!is_array($item) || empty($item['productId']) || filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT) === false || (int)$item['quantity'] < 1) {
                    throw new Exception("Produk atau jumlah order tidak valid.");
                }
                $stmtProduct = $pdo->prepare("SELECT id, name, sku, category, costPrice FROM products WHERE id = ? AND (status != 'INACTIVE' OR status IS NULL OR status = '') LIMIT 1");
                $stmtProduct->execute([$item['productId']]);
                $product = $stmtProduct->fetch();
                if (!$product) throw new Exception("Produk order tidak ditemukan.");
                if ($authRole === 'TENANT' && !in_array(strtoupper(trim((string)$product['category'])), $tenantCategories, true)) {
                    throw new Exception("Produk berada di luar kategori yang dikelola tenant.");
                }
                $estimatedCost = $authRole === 'TENANT' ? (float)$product['costPrice'] : ($item['estimatedCost'] ?? $product['costPrice']);
                if (!is_numeric($estimatedCost) || (float)$estimatedCost < 0) throw new Exception("Harga order tidak valid.");
                $estimatedCost = (float)$estimatedCost;
                $quantity = (int)$item['quantity'];
                $subtotal = round($quantity * $estimatedCost, 2);
                $computedTotal += $subtotal;
                $normalizedItems[] = [
                    'product' => $product,
                    'quantity' => $quantity,
                    'estimatedCost' => $estimatedCost,
                    'subtotal' => $subtotal
                ];
            }
        }
        $totalCost = $replaceItems ? round($computedTotal, 2) : (float)$oldOrder['totalCost'];

        // 1. Simpan/Update header order
        // Gunakan INSERT ... ON DUPLICATE KEY UPDATE untuk menghindari penghapusan cascade pada order_items
        $stmt = $pdo->prepare("INSERT INTO orders (id, staffId, status, totalCost, createdAt, approvedAt, receivedAt, notes) 
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE 
                               status = VALUES(status), 
                               totalCost = VALUES(totalCost), 
                               approvedAt = VALUES(approvedAt), 
                               receivedAt = VALUES(receivedAt), 
                               notes = VALUES(notes)");
        $stmt->execute([
            $data['id'], $auth['name'] ?? ($auth['uid'] ?? 'SYSTEM'), $targetStatus, $totalCost,
            str_replace('T', ' ', $data['createdAt']),
            isset($data['approvedAt']) ? str_replace('T', ' ', $data['approvedAt']) : null,
            isset($data['receivedAt']) ? str_replace('T', ' ', $data['receivedAt']) : null,
            $data['notes'] ?? null
        ]);

        // 2. Simpan/Update items
        // Selalu sinkronkan items jika disediakan dalam request
        if ($replaceItems) {
            // Hapus items lama dan masukkan yang baru untuk memastikan konsistensi data
            $stmtDel = $pdo->prepare("DELETE FROM order_items WHERE orderId = ?");
            $stmtDel->execute([$data['id']]);
            
            foreach ($normalizedItems as $normalizedItem) {
                $item = $normalizedItem['product'];
                $stmtItem = $pdo->prepare("INSERT INTO order_items (orderId, productId, name, sku, quantity, estimatedCost, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmtItem->execute([
                    $data['id'], $item['id'], $item['name'], $item['sku'] ?? '', $normalizedItem['quantity'], $normalizedItem['estimatedCost'], $normalizedItem['subtotal']
                ]);
            }
        }

        // 3. LOGIKA SINKRONISASI STOK: Jika status berubah menjadi RECEIVED
        if ($data['status'] === 'RECEIVED' && (!$oldOrder || $oldOrder['status'] !== 'RECEIVED')) {
            // Ambil items dari database
            $stmtGetItems = $pdo->prepare("SELECT productId, quantity FROM order_items WHERE orderId = ?");
            $stmtGetItems->execute([$data['id']]);
            $items = $stmtGetItems->fetchAll();

            foreach ($items as $item) {
                // Update stok produk
                $stmtStock = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
                $stmtStock->execute([$item['quantity'], $item['productId']]);
            }
        }

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Order berhasil diproses"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}
