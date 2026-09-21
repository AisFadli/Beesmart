<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF']);

try {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    
    if (!$data || !isset($data['id'])) throw new Exception("Invalid input");
    
    $proposalId = $data['id'];
    $adminNote = $data['adminNote'] ?? '';
    
    // Get proposal data
    $stmt = $pdo->prepare("SELECT * FROM product_proposals WHERE id = ?");
    $stmt->execute([$proposalId]);
    $proposal = $stmt->fetch();
    
    if (!$proposal) throw new Exception("Proposal not found");
    if ($proposal['status'] !== 'PENDING') throw new Exception("Proposal already processed");
    
    $productData = json_decode($proposal['data'], true);
    if (isset($productData['category'])) {
        $productData['category'] = strtoupper(trim($productData['category']));
    }
    
    $barcode = !empty($productData['barcode']) ? trim($productData['barcode']) : ($productData['sku'] ?? $proposal['productId'] ?? $productData['id']);
    
    $pdo->beginTransaction();
    
    if ($proposal['productId']) {
        // Update existing product
        $stmt = $pdo->prepare("INSERT INTO products (id, sku, barcode, name, category, price, costPrice, stock, minStock, image, discountValue, discountType, discountStart, discountEnd, initialStock, initialStockDate, status) 
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE 
                               sku=VALUES(sku), barcode=VALUES(barcode), name=VALUES(name), category=VALUES(category), price=VALUES(price), 
                               costPrice=VALUES(costPrice), stock=VALUES(stock), minStock=VALUES(minStock), 
                               image=VALUES(image), discountValue=VALUES(discountValue), discountType=VALUES(discountType), 
                               discountStart=VALUES(discountStart), discountEnd=VALUES(discountEnd), 
                               initialStock=VALUES(initialStock), initialStockDate=VALUES(initialStockDate), 
                               status=VALUES(status)");
        $stmt->execute([
            $proposal['productId'],
            $productData['sku'],
            $barcode,
            $productData['name'],
            $productData['category'],
            $productData['price'],
            $productData['costPrice'],
            $productData['stock'],
            $productData['minStock'],
            $productData['image'],
            $productData['discountValue'] ?? 0,
            $productData['discountType'] ?? 'FIXED',
            $productData['discountStart'] ?? null,
            $productData['discountEnd'] ?? null,
            $productData['initialStock'] ?? 0,
            $productData['initialStockDate'] ?? date('Y-m-d H:i:s'),
            $productData['status'] ?? 'ACTIVE'
        ]);
    } else {
        // Create new product
        $stmt = $pdo->prepare("INSERT INTO products (id, sku, barcode, name, category, price, costPrice, stock, minStock, image, discountValue, discountType, discountStart, discountEnd, initialStock, initialStockDate, status) 
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $productData['id'],
            $productData['sku'],
            $barcode,
            $productData['name'],
            $productData['category'],
            $productData['price'],
            $productData['costPrice'],
            $productData['stock'],
            $productData['minStock'],
            $productData['image'],
            $productData['discountValue'] ?? 0,
            $productData['discountType'] ?? 'FIXED',
            $productData['discountStart'] ?? null,
            $productData['discountEnd'] ?? null,
            $productData['initialStock'] ?? 0,
            $productData['initialStockDate'] ?? date('Y-m-d H:i:s'),
            $productData['status'] ?? 'ACTIVE'
        ]);
    }
    
    // Update proposal status
    $stmt = $pdo->prepare("UPDATE product_proposals SET status = 'APPROVED', adminNote = ? WHERE id = ?");
    $stmt->execute([$adminNote, $proposalId]);
    
    $pdo->commit();
    
    sendResponse(["status" => "success", "message" => "Perubahan produk disetujui dan diterapkan"]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
