<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'TENANT']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!is_array($data) || empty($data['productId']) || filter_var($data['quantity'] ?? null, FILTER_VALIDATE_INT) === false || (int)$data['quantity'] <= 0) {
        sendResponse(["status" => "error", "message" => "Data laporan tidak lengkap."], 400);
    }

    $type = strtoupper((string)($data['type'] ?? 'DAMAGE'));
    if (!in_array($type, ['DAMAGE', 'LOSS', 'EXPIRED', 'RESTOCK', 'RETURN', 'IN'], true)) {
        sendResponse(["status" => "error", "message" => "Jenis penyesuaian tidak valid."], 400);
    }

    try {
        $pdo->beginTransaction();

        $timestamp = isset($data['timestamp']) ? str_replace('T', ' ', $data['timestamp']) : date('Y-m-d H:i:s');
        $status = (strtoupper($auth['role'] ?? '') === 'ADMIN') ? 'NORMAL' : 'PENDING';

        $stmtProduct = $pdo->prepare("SELECT id FROM products WHERE id = ? FOR UPDATE");
        $stmtProduct->execute([$data['productId']]);
        if (!$stmtProduct->fetch()) {
            throw new Exception("Produk tidak ditemukan.");
        }

        $staffId = $auth['name'] ?? ($auth['uid'] ?? 'SYSTEM');

        $stmt = $pdo->prepare("INSERT INTO stock_adjustments (productId, quantity, type, timestamp, staffId, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $data['productId'],
            (int)$data['quantity'],
            $type,
            $timestamp,
            $staffId,
            $data['notes'] ?? null,
            $status
        ]);

        // Hanya kurangi/tambah stok produk secara fisik jika statusnya NORMAL (Admin yang input)
        if ($status === 'NORMAL') {
            $isAddition = in_array($type, ['IN', 'RESTOCK', 'RETURN'], true);
            $mutation = $isAddition ? (int)$data['quantity'] : -(int)$data['quantity'];
            
            $stmtStock = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
            $stmtStock->execute([$mutation, $data['productId']]);
        }

        $pdo->commit();
        $msg = ($status === 'PENDING') ? "Laporan berhasil diajukan dan menunggu persetujuan Admin." : "Stok berhasil disesuaikan.";
        sendResponse(["status" => "success", "message" => $msg]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendResponse(["status" => "error", "message" => "Database Error: " . $e->getMessage()], 500);
    }
} else {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}
?>