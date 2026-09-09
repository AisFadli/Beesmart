
<?php
require_once 'db.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $memberId = $data['id'] ?? '';
    $amount = (float)($data['amount'] ?? 0);
    $proofImage = $data['proofImage'] ?? null;
    $role = $data['userRole'] ?? 'MEMBER';

    if (empty($memberId) || $amount <= 0) {
        sendResponse(["status" => "error", "message" => "ID Member dan nominal wajib valid."], 400);
    }

    try {
        $pdo->beginTransaction();
        
        // ADMIN langsung APPROVED, selain itu PENDING
        $status = ($role === 'ADMIN') ? 'APPROVED' : 'PENDING';
        $notes = ($role === 'ADMIN') ? "Top Up Saldo via Admin" : "Pengajuan Top Up via $role (Menunggu Persetujuan)";

        // 1. Jika ADMIN, update saldo member secara real-time
        if ($status === 'APPROVED') {
            $stmt = $pdo->prepare("UPDATE members SET depositBalance = depositBalance + ? WHERE id = ?");
            $stmt->execute([$amount, $memberId]);
        }

        // 2. Catat Log (apakah disetujui atau masih pending)
        $logStmt = $pdo->prepare("INSERT INTO member_logs (memberId, type, amount, timestamp, notes, status, proof_image) VALUES (?, 'TOPUP', ?, NOW(), ?, ?, ?)");
        $logStmt->execute([$memberId, $amount, $notes, $status, $proofImage]);

        $pdo->commit();
        $msg = ($status === 'APPROVED') ? "Top up berhasil ditambahkan." : "Pengajuan top up berhasil dikirim. Tunggu verifikasi admin.";
        sendResponse(["status" => "success", "message" => $msg]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => "Gagal Top Up: " . $e->getMessage()], 500);
    }
} else {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}
