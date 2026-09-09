<?php
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $status = $_GET['status'] ?? 'PENDING';
        $stmt = $pdo->prepare("SELECT * FROM product_proposals WHERE status = ? ORDER BY createdAt DESC");
        $stmt->execute([$status]);
        $proposals = $stmt->fetchAll();
        foreach ($proposals as &$p) {
            $p['data'] = json_decode($p['data'], true);
        }
        sendResponse($proposals);
    } elseif ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        
        if (!$data) throw new Exception("Invalid input format");
        
        $productId = $data['productId'] ?? null;
        $type = $data['type'] ?? 'UPDATE';
        $pData = $data['productData'] ?? [];
        
        if (isset($pData['category'])) {
            $pData['category'] = strtoupper(trim($pData['category']));
        }
        
        $productJson = json_encode($pData);
        if ($productJson === false) {
            throw new Exception("Gagal memproses data produk (JSON Error: " . json_last_error_msg() . ")");
        }

        $staffId = $data['staffId'] ?? 'unknown';
        $reason = $data['reason'] ?? '';
        $id = 'PROP-' . time() . '-' . rand(1000, 9999);
        
        $stmt = $pdo->prepare("INSERT INTO product_proposals (id, productId, type, data, staffId, status, reason) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)");
        $stmt->execute([$id, $productId, $type, $productJson, $staffId, $reason]);
        
        sendResponse(["status" => "success", "message" => "Pengajuan perubahan produk dikirim ke Admin"]);
    }
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
