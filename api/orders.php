
<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR']);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    try {
        $pdo->beginTransaction();

        // Cek apakah order sudah ada (untuk update status)
        $stmtCheck = $pdo->prepare("SELECT status FROM orders WHERE id = ?");
        $stmtCheck->execute([$data['id']]);
        $oldOrder = $stmtCheck->fetch();

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
            $data['id'], $data['staffId'], $data['status'], $data['totalCost'],
            str_replace('T', ' ', $data['createdAt']),
            isset($data['approvedAt']) ? str_replace('T', ' ', $data['approvedAt']) : null,
            isset($data['receivedAt']) ? str_replace('T', ' ', $data['receivedAt']) : null,
            $data['notes'] ?? null
        ]);

        // 2. Simpan/Update items
        // Selalu sinkronkan items jika disediakan dalam request
        if (isset($data['items']) && is_array($data['items'])) {
            // Hapus items lama dan masukkan yang baru untuk memastikan konsistensi data
            $stmtDel = $pdo->prepare("DELETE FROM order_items WHERE orderId = ?");
            $stmtDel->execute([$data['id']]);
            
            foreach ($data['items'] as $item) {
                $stmtItem = $pdo->prepare("INSERT INTO order_items (orderId, productId, name, sku, quantity, estimatedCost, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmtItem->execute([
                    $data['id'], $item['productId'], $item['name'], $item['sku'] ?? '', $item['quantity'], $item['estimatedCost'], $item['subtotal']
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
