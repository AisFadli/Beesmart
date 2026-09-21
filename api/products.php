
<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR']);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    try {
        // Log action
        $before = null;
        if (isset($data['id'])) {
            $stmt = $pdo->prepare("SELECT * FROM products WHERE id = ?");
            $stmt->execute([$data['id']]);
            $before = $stmt->fetch();
        }

        // Check if SKU is already used by another product (active or inactive)
        $skuCheck = trim($data['sku'] ?? '');
        if (!empty($skuCheck)) {
            $skuStmt = $pdo->prepare("SELECT id, name, status FROM products WHERE sku = ? AND id != ?");
            $skuStmt->execute([$skuCheck, $data['id'] ?? '']);
            $existingSkuProduct = $skuStmt->fetch();
            if ($existingSkuProduct) {
                $statusMsg = $existingSkuProduct['status'] === 'INACTIVE' ? 'non-aktif' : 'aktif';
                sendResponse(["status" => "error", "message" => "SKU sudah digunakan oleh produk " . $existingSkuProduct['name'] . " (Status: " . $statusMsg . "). Silakan gunakan SKU lain."], 400);
            }
        }

        $barcode = !empty($data['barcode']) ? trim($data['barcode']) : ($data['sku'] ?? $data['id']);

        $stmt = $pdo->prepare("INSERT INTO products (id, sku, barcode, name, category, price, costPrice, stock, initialStock, minStock, image, initialStockDate, status, discountValue, discountType, discountStart, discountEnd) 
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE 
                               sku = VALUES(sku), 
                               barcode = VALUES(barcode),
                               name = VALUES(name), 
                               category = VALUES(category), 
                               price = VALUES(price), 
                               costPrice = VALUES(costPrice), 
                               stock = VALUES(stock), 
                               initialStock = VALUES(initialStock), 
                               minStock = VALUES(minStock), 
                               image = VALUES(image), 
                               initialStockDate = VALUES(initialStockDate), 
                               status = VALUES(status), 
                               discountValue = VALUES(discountValue), 
                               discountType = VALUES(discountType), 
                               discountStart = VALUES(discountStart), 
                               discountEnd = VALUES(discountEnd)");
        $status = $data['status'] ?? ($before ? $before['status'] : 'ACTIVE');
        $normalizedCategory = strtoupper(trim($data['category'] ?? 'LAINNYA'));
        $stmt->execute([
            $data['id'], $data['sku'], $barcode, $data['name'], $normalizedCategory, 
            (float)$data['price'], (float)$data['costPrice'], (int)$data['stock'], (int)($data['initialStock'] ?? 0), (int)$data['minStock'], 
            $data['image'] ?? null, 
            isset($data['initialStockDate']) ? str_replace('T', ' ', $data['initialStockDate']) : null,
            $status,
            (float)($data['discountValue'] ?? 0),
            $data['discountType'] ?? 'FIXED',
            isset($data['discountStart']) && $data['discountStart'] ? str_replace('T', ' ', $data['discountStart']) : null,
            isset($data['discountEnd']) && $data['discountEnd'] ? str_replace('T', ' ', $data['discountEnd']) : null
        ]);

        if ($before) {
            logActivity($pdo, $data['staffName'] ?? 'System', 'Inventory', 'UPDATE', $data['id'], $before, $data);
        }
        
        sendResponse(["status" => "success", "message" => "Produk berhasil diperbarui"]);
    } catch (PDOException $e) {
        sendResponse(["status" => "error", "message" => "Gagal menyimpan produk: " . $e->getMessage()], 500);
    }
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    try {
        // Fetch before data for log
        $stmt = $pdo->prepare("SELECT * FROM products WHERE id = ?");
        $stmt->execute([$id]);
        $before = $stmt->fetch();

        if ($before) {
            $stmt = $pdo->prepare("UPDATE products SET status = 'INACTIVE' WHERE id = ?");
            $stmt->execute([$id]);
            logActivity($pdo, $_GET['staffName'] ?? 'System', 'Inventory', 'DELETE', $id, $before, ['status' => 'INACTIVE']);
        }
        
        sendResponse(["status" => "success", "message" => "Produk berhasil dihapus"]);
    } catch (PDOException $e) {
        sendResponse(["status" => "error", "message" => "Gagal menghapus produk: " . $e->getMessage()], 500);
    }
}
