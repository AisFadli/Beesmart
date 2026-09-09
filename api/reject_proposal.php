<?php
require_once 'db.php';

try {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    
    if (!$data || !isset($data['id'])) throw new Exception("Invalid input");
    
    $proposalId = $data['id'];
    $adminNote = $data['adminNote'] ?? '';
    
    $stmt = $pdo->prepare("UPDATE product_proposals SET status = 'DECLINED', adminNote = ? WHERE id = ?");
    $stmt->execute([$adminNote, $proposalId]);
    
    sendResponse(["status" => "success", "message" => "Pengajuan perubahan produk ditolak"]);
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
