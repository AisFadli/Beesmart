<?php
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

try {
    if ($method === 'POST') {
        $action = $data['action'] ?? 'send';

        if ($action === 'send') {
            $senderId = $data['senderId'] ?? '';
            $senderRole = $data['senderRole'] ?? '';
            $senderName = $data['senderName'] ?? '';
            $receiverId = $data['receiverId'] ?? '';
            $receiverRole = $data['receiverRole'] ?? '';
            $receiverName = $data['receiverName'] ?? '';
            $message = $data['message'] ?? '';

            if (empty($senderId) || empty($receiverId) || empty($message)) {
                throw new Exception("Sender, Receiver, dan Pesan tidak boleh kosong.");
            }

            $stmt = $pdo->prepare("INSERT INTO messages (senderId, senderRole, senderName, receiverId, receiverRole, receiverName, message) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$senderId, $senderRole, $senderName, $receiverId, $receiverRole, $receiverName, $message]);

            sendResponse(["status" => "success", "id" => $pdo->lastInsertId()]);
        } elseif ($action === 'mark_read') {
            $senderId = $data['senderId'] ?? '';
            $receiverId = $data['receiverId'] ?? '';

            if (empty($receiverId)) {
                throw new Exception("Parameter receiverId kosong.");
            }

            if (empty($senderId) || $senderId === 'ANY') {
                $stmt = $pdo->prepare("UPDATE messages SET isRead = 1 WHERE receiverId = ?");
                $stmt->execute([$receiverId]);
            } else {
                $stmt = $pdo->prepare("UPDATE messages SET isRead = 1 WHERE senderId = ? AND receiverId = ?");
                $stmt->execute([$senderId, $receiverId]);
            }

            sendResponse(["status" => "success"]);
        }
    } else {
        throw new Exception("Metode request tidak diizinkan.");
    }
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
