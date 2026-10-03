<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF', 'USER', 'MEMBER', 'TENANT', 'VISITOR']);

$auth = currentAuth();
$role = strtoupper($auth['role'] ?? '');
$userId = $auth['uid'] ?? '';

$lastId = isset($_GET['lastId']) && ctype_digit((string)$_GET['lastId']) ? (int)$_GET['lastId'] : 0;

try {
    // Normalize Member ID jika punya prefix USER-
    $memberSearchId = (strpos($userId, 'USER-') === 0) ? substr($userId, 5) : $userId;

    $tenantUser = null;

    if ($role === 'TENANT' || $role === 'ADMIN' || $role === 'STAFF') {
        $uStmt = $pdo->prepare("SELECT * FROM users WHERE (id = ? OR id = ? OR email = ?) AND (status = 'ACTIVE' OR status IS NULL OR status = '') LIMIT 1");
        $uStmt->execute([
            $userId,
            preg_replace('/^(USER-|USR-)/i', '', trim($userId)),
            $userId
        ]);
        $tenantUser = $uStmt->fetch();
    }

    $msgs = [];

    if ($role === 'MEMBER') {
        $mStmt = $pdo->prepare("SELECT * FROM messages WHERE (senderId = ? OR receiverId = ?) AND id > ? ORDER BY id ASC");
        $mStmt->execute([$memberSearchId, $memberSearchId, $lastId]);
        $msgs = $mStmt->fetchAll();
    } elseif ($role === 'TENANT') {
        $candidateIds = array_values(array_unique(array_filter([
            $userId,
            trim($userId),
            $tenantUser ? $tenantUser['id'] : null,
            $tenantUser ? $tenantUser['name'] : null,
            preg_replace('/^(USER-|USR-)/i', '', trim($userId)),
            'USER-' . preg_replace('/^(USER-|USR-)/i', '', trim($userId)),
            'USR-' . preg_replace('/^(USER-|USR-)/i', '', trim($userId)),
        ])));
        if (empty($candidateIds)) {
            $candidateIds = [$userId];
        }
        $inPlaceholders = implode(',', array_fill(0, count($candidateIds), '?'));
        $sql = "SELECT * FROM messages 
                WHERE id > ? 
                  AND (receiverId = 'TENANT_ROOM' 
                       OR senderId IN ($inPlaceholders) 
                       OR receiverId IN ($inPlaceholders)) 
                ORDER BY id ASC";
        $mStmt = $pdo->prepare($sql);
        $mStmt->execute(array_merge([$lastId], $candidateIds, $candidateIds));
        $msgs = $mStmt->fetchAll();
    } elseif ($role === 'VISITOR') {
        $candidateIds = array_values(array_unique(array_filter([
            $userId,
            trim($userId),
            preg_replace('/^(USER-|USR-)/i', '', trim($userId)),
            'USER-' . preg_replace('/^(USER-|USR-)/i', '', trim($userId)),
            'USR-' . preg_replace('/^(USER-|USR-)/i', '', trim($userId)),
        ])));
        if (empty($candidateIds)) {
            $candidateIds = [$userId];
        }
        $inPlaceholders = implode(',', array_fill(0, count($candidateIds), '?'));
        $sql = "SELECT * FROM messages 
                WHERE id > ? 
                  AND (receiverId = 'INTERNAL' 
                       OR ((senderId IN ($inPlaceholders) OR receiverId IN ($inPlaceholders)) 
                           AND senderRole IN ('ADMIN', 'STAFF', 'VISITOR') 
                           AND receiverRole IN ('ADMIN', 'STAFF', 'VISITOR'))) 
                ORDER BY id ASC";
        $mStmt = $pdo->prepare($sql);
        $mStmt->execute(array_merge([$lastId], $candidateIds, $candidateIds));
        $msgs = $mStmt->fetchAll();
    } else {
        $sql = "SELECT * FROM messages WHERE id > ? ORDER BY id ASC";
        $mStmt = $pdo->prepare($sql);
        $mStmt->execute([$lastId]);
        $msgs = $mStmt->fetchAll();
    }

    $maxId = $lastId;
    foreach ($msgs as &$msg) {
        $msg['timestamp'] = str_replace(' ', 'T', $msg['timestamp']);
        $msg['isRead'] = (int)$msg['isRead'];
        if ((int)$msg['id'] > $maxId) {
            $maxId = (int)$msg['id'];
        }
    }

    sendResponse(["status" => "success", "messages" => $msgs, "lastId" => $maxId]);
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}