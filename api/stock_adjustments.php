<?php
require_once 'db.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!$data || !isset($data['productId']) || !isset($data['quantity'])) {
        sendResponse(["status" => "error", "message" => "Data laporan tidak lengkap."], 400);
    }

    try {
        $pdo->beginTransaction();

        $timestamp = isset($data['timestamp']) ? str_replace('T', ' ', $data['timestamp']) : date('Y-m-d H:i:s');
        $userRole = $data['userRole'] ?? 'STAFF';
        $status = ($userRole === 'ADMIN') ? 'NORMAL' : 'PENDING';

        $stmt = $pdo->prepare("INSERT INTO stock_adjustments (productId, quantity, type, timestamp, staffId, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $data['productId'],
            (int)$data['quantity'],
            $data['type'] ?? 'DAMAGE',
            $timestamp,
            $data['staffId'] ?? 'SYSTEM',
            $data['notes'] ?? null,
            $status
        ]);

        // Hanya kurangi/tambah stok produk secara fisik jika statusnya NORMAL (Admin yang input)
        if ($status === 'NORMAL') {
            $isAddition = (($data['type'] ?? '') === 'IN' || ($data['type'] ?? '') === 'RESTOCK');
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