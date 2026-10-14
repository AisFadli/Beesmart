<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF']);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $logId = $data['logId'] ?? null;
    $reason = $data['reason'] ?? 'Ditolak sistem / bukti transfer tidak sesuai';

    if (!$logId) {
        sendResponse(["status" => "error", "message" => "ID log top up tidak valid."], 400);
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("SELECT * FROM member_logs WHERE id = ? AND status = 'PENDING' LIMIT 1");
        $stmt->execute([$logId]);
        $log = $stmt->fetch();

        if (!$log) {
            throw new Exception("Log top up tidak ditemukan atau sudah diproses.");
        }

        $note = " - DITOLAK: " . $reason;
        $updLog = $pdo->prepare("UPDATE member_logs SET status = 'REJECTED', notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?");
        $updLog->execute([$note, $logId]);

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Pengajuan top up berhasil ditolak."]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}
