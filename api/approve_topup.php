
<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $logId = $data['logId'] ?? null;

    if (!$logId) {
        sendResponse(["status" => "error", "message" => "ID Log tidak valid."], 400);
    }

    try {
        $pdo->beginTransaction();

        // 1. Ambil detail log pending
        $stmt = $pdo->prepare("SELECT * FROM member_logs WHERE id = ? AND status = 'PENDING' LIMIT 1");
        $stmt->execute([$logId]);
        $log = $stmt->fetch();

        if (!$log) {
            throw new Exception("Log top up tidak ditemukan atau sudah diproses.");
        }

        // 2. Tambahkan saldo ke member
        $updMember = $pdo->prepare("UPDATE members SET depositBalance = depositBalance + ? WHERE id = ?");
        $updMember->execute([$log['amount'], $log['memberId']]);

        // 3. Update status log menjadi APPROVED
        $updLog = $pdo->prepare("UPDATE member_logs SET status = 'APPROVED', notes = CONCAT(notes, ' - DISETUJUI ADMIN') WHERE id = ?");
        $updLog->execute([$logId]);

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Top Up Berhasil Disetujui!"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
} else {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}
