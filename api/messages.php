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
            $message = trim((string)($data['message'] ?? ''));
            $imageUrl = !empty($data['imageUrl']) ? trim((string)$data['imageUrl']) : null;

            if (empty($senderId) || empty($receiverId) || (empty($message) && empty($imageUrl))) {
                throw new Exception("Sender, Receiver, dan Pesan atau Foto tidak boleh kosong.");
            }

            $stmt = $pdo->prepare("INSERT INTO messages (senderId, senderRole, senderName, receiverId, receiverRole, receiverName, message, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$senderId, $senderRole, $senderName, $receiverId, $receiverRole, $receiverName, $message, $imageUrl]);

            sendResponse(["status" => "success", "id" => $pdo->lastInsertId()]);
        } elseif ($action === 'delete') {
            $msgId = (int)($data['id'] ?? 0);
            if ($msgId <= 0) {
                throw new Exception("ID pesan tidak valid.");
            }

            // Otorisasi: pengirim pesan tsb ATAU role ADMIN
            $auth = currentAuth();
            $authRole = strtoupper((string)($auth['role'] ?? ''));
            $authUid = strtolower(preg_replace('/^(USER-|USR-)/i', '', trim((string)($auth['uid'] ?? ''))));

            $chkStmt = $pdo->prepare("SELECT * FROM messages WHERE id = ? LIMIT 1");
            $chkStmt->execute([$msgId]);
            $msg = $chkStmt->fetch();

            if (!$msg) {
                throw new Exception("Pesan tidak ditemukan.");
            }

            $msgSenderNorm = strtolower(preg_replace('/^(USER-|USR-)/i', '', trim((string)$msg['senderId'])));
            $isSender = ($authUid !== '' && $authUid === $msgSenderNorm);
            $isAdmin = ($authRole === 'ADMIN');

            if (!$isSender && !$isAdmin) {
                sendResponse(["status" => "error", "message" => "Anda tidak berhak menghapus pesan ini."], 403);
            }

            // Hapus file foto dari uploads jika ada dan aman
            if (!empty($msg['imageUrl'])) {
                $rawImg = ltrim($msg['imageUrl'], '/');
                if (strpos($rawImg, 'uploads/') === 0) {
                    $filePath = dirname(__DIR__) . '/' . $rawImg;
                    $realUploads = realpath(dirname(__DIR__) . '/uploads');
                    $realFile = realpath($filePath);
                    if ($realFile && $realUploads && strpos($realFile, $realUploads) === 0 && file_exists($realFile)) {
                        @unlink($realFile);
                    }
                }
            }

            $delStmt = $pdo->prepare("DELETE FROM messages WHERE id = ?");
            $delStmt->execute([$msgId]);

            sendResponse(["status" => "success", "message" => "Pesan berhasil dihapus."]);
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
