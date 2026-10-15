<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'TENANT', 'VISITOR', 'MEMBER']);
$authRole = strtoupper($auth['role'] ?? '');
$authUid = trim((string)($auth['uid'] ?? ''));
$cleanAuthUid = preg_replace('/^(USER-|USR-)/i', '', $authUid);

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

try {
    if ($method === 'POST') {
        $action = $data['action'] ?? 'send';

        if ($action === 'send') {
            $requestedReceiverId = trim((string)($data['receiverId'] ?? ''));
            $message = trim((string)($data['message'] ?? ''));
            $imageUrl = !empty($data['imageUrl']) ? trim((string)$data['imageUrl']) : null;

            if ($requestedReceiverId === '' || (empty($message) && empty($imageUrl)) || strlen($message) > 20000) {
                throw new Exception("Sender, Receiver, dan Pesan atau Foto tidak boleh kosong.");
            }

            if ($imageUrl !== null && !preg_match('#^uploads/[A-Za-z0-9_.-]+$#', $imageUrl)) {
                sendResponse(["status" => "error", "message" => "Lampiran tidak valid."], 400);
            }

            $receiverId = $requestedReceiverId;
            $receiverRole = '';
            $receiverName = '';
            if ($requestedReceiverId === 'TENANT_ROOM' && in_array($authRole, ['ADMIN', 'STAFF', 'TENANT'], true)) {
                $receiverRole = 'TENANT_GROUP';
                $receiverName = 'Room Koordinasi Tenant';
            } elseif ($requestedReceiverId === 'INTERNAL' && in_array($authRole, ['ADMIN', 'STAFF', 'VISITOR'], true)) {
                $receiverRole = 'STAFF';
                $receiverName = 'Komunitas Internal Staff';
            } elseif ($requestedReceiverId === 'ADMIN' && $authRole === 'MEMBER') {
                $receiverRole = 'ADMIN';
                $receiverName = 'Admin Koperasi';
            } else {
                $stmtMember = $pdo->prepare("SELECT id, name FROM members WHERE id = ? AND status = 'APPROVED' LIMIT 1");
                $stmtMember->execute([$requestedReceiverId]);
                $targetMember = $stmtMember->fetch();
                if ($targetMember && in_array($authRole, ['ADMIN', 'STAFF', 'TENANT'], true)) {
                    $receiverRole = 'MEMBER';
                    $receiverName = $targetMember['name'];
                } else {
                    $stmtUser = $pdo->prepare("SELECT id, name, role FROM users WHERE id = ? AND (status = 'ACTIVE' OR status IS NULL OR status = '') LIMIT 1");
                    $stmtUser->execute([$requestedReceiverId]);
                    $targetUser = $stmtUser->fetch();
                    $targetRole = strtoupper((string)($targetUser['role'] ?? ''));
                    $canContactUser = $targetUser && in_array($authRole, ['ADMIN', 'STAFF', 'TENANT', 'VISITOR'], true);
                    if ($authRole === 'MEMBER') $canContactUser = $targetUser && $targetRole === 'TENANT';
                    if ($authRole === 'VISITOR') $canContactUser = $targetUser && in_array($targetRole, ['ADMIN', 'STAFF'], true);
                    if (!$canContactUser) {
                        sendResponse(["status" => "error", "message" => "Penerima tidak valid atau Anda tidak berhak menghubunginya."], 403);
                    }
                    $receiverId = $targetUser['id'];
                    $receiverRole = $targetRole;
                    $receiverName = $targetUser['name'];
                }
            }

            if ($receiverRole === '') {
                sendResponse(["status" => "error", "message" => "Penerima tidak valid atau Anda tidak berhak menghubunginya."], 403);
            }

            $stmtSender = $pdo->prepare("SELECT name FROM users WHERE id = ? UNION SELECT name FROM members WHERE id = ? LIMIT 1");
            $stmtSender->execute([$authUid, $authUid]);
            $senderName = $stmtSender->fetchColumn() ?: ($auth['email'] ?? 'User');
            $senderId = $authRole === 'MEMBER' ? $cleanAuthUid : $authUid;
            if (in_array($authRole, ['ADMIN', 'STAFF'], true) && $receiverRole === 'MEMBER') {
                $senderId = 'ADMIN';
            }

            $stmt = $pdo->prepare("INSERT INTO messages (senderId, senderRole, senderName, receiverId, receiverRole, receiverName, message, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$senderId, $authRole, $senderName, $receiverId, $receiverRole, $receiverName, $message, $imageUrl]);

            sendResponse(["status" => "success", "id" => $pdo->lastInsertId()]);
        } elseif ($action === 'delete') {
            $msgId = (int)($data['id'] ?? 0);
            if ($msgId <= 0) {
                throw new Exception("ID pesan tidak valid.");
            }

            // Otorisasi: pengirim pesan tsb ATAU role ADMIN
            $normalizedAuthUid = strtolower($cleanAuthUid);

            $chkStmt = $pdo->prepare("SELECT * FROM messages WHERE id = ? LIMIT 1");
            $chkStmt->execute([$msgId]);
            $msg = $chkStmt->fetch();

            if (!$msg) {
                throw new Exception("Pesan tidak ditemukan.");
            }

            $msgSenderNorm = strtolower(preg_replace('/^(USER-|USR-)/i', '', trim((string)$msg['senderId'])));
            $isSender = ($normalizedAuthUid !== '' && $normalizedAuthUid === $msgSenderNorm);
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
            $senderId = trim((string)($data['senderId'] ?? ''));
            $receiverId = trim((string)($data['receiverId'] ?? ''));

            $allowedReceivers = [$authUid, $cleanAuthUid];
            if (in_array($authRole, ['ADMIN', 'STAFF'], true)) $allowedReceivers = array_merge($allowedReceivers, ['ADMIN', 'INTERNAL']);
            if ($authRole === 'TENANT') $allowedReceivers[] = 'TENANT_ROOM';
            if ($authRole === 'VISITOR') $allowedReceivers[] = 'INTERNAL';
            $allowedReceivers = array_values(array_unique(array_filter($allowedReceivers)));

            if ($receiverId === '' || !in_array($receiverId, $allowedReceivers, true)) {
                sendResponse(["status" => "error", "message" => "Anda tidak berhak memperbarui status pesan ini."], 403);
            }

            if ($receiverId === '') {
                throw new Exception("Parameter receiverId kosong.");
            }

            $receiverPlaceholders = implode(',', array_fill(0, count($allowedReceivers), '?'));
            $params = $allowedReceivers;
            if (empty($senderId) || $senderId === 'ANY') {
                $stmt = $pdo->prepare("UPDATE messages SET isRead = 1 WHERE receiverId IN ($receiverPlaceholders)");
                $stmt->execute($params);
            } else {
                $stmt = $pdo->prepare("UPDATE messages SET isRead = 1 WHERE senderId = ? AND receiverId IN ($receiverPlaceholders)");
                $stmt->execute(array_merge([$senderId], $params));
            }

            sendResponse(["status" => "success"]);
        } else {
            sendResponse(["status" => "error", "message" => "Aksi pesan tidak valid."], 400);
        }
    } else {
        throw new Exception("Metode request tidak diizinkan.");
    }
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
