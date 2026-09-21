<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR']);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM shipping_rates WHERE status = 'ACTIVE' ORDER BY minDistance ASC");
    sendResponse($stmt->fetchAll());
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    try {
        if (isset($data['id'])) {
            $stmt = $pdo->prepare("SELECT * FROM shipping_rates WHERE id = ?");
            $stmt->execute([$data['id']]);
            $before = $stmt->fetch();

            $stmt = $pdo->prepare("UPDATE shipping_rates SET minDistance = ?, maxDistance = ?, rate = ? WHERE id = ?");
            $stmt->execute([$data['minDistance'], $data['maxDistance'], $data['rate'], $data['id']]);
            
            logActivity($pdo, $data['staffName'] ?? 'System', 'Settings', 'UPDATE_SHIPPING_RATE', $data['id'], $before, $data);
        } else {
            $stmt = $pdo->prepare("INSERT INTO shipping_rates (minDistance, maxDistance, rate) VALUES (?, ?, ?)");
            $stmt->execute([$data['minDistance'], $data['maxDistance'], $data['rate']]);
            $id = $pdo->lastInsertId();
            
            logActivity($pdo, $data['staffName'] ?? 'System', 'Settings', 'CREATE_SHIPPING_RATE', $id, null, $data);
        }
        sendResponse(["status" => "success"]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    try {
        $stmt = $pdo->prepare("SELECT * FROM shipping_rates WHERE id = ?");
        $stmt->execute([$id]);
        $before = $stmt->fetch();

        if ($before) {
            $stmt = $pdo->prepare("UPDATE shipping_rates SET status = 'INACTIVE' WHERE id = ?");
            $stmt->execute([$id]);
            logActivity($pdo, $_GET['staffName'] ?? 'System', 'Settings', 'DELETE_SHIPPING_RATE', $id, $before, ['status' => 'INACTIVE']);
        }
        sendResponse(["status" => "success"]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}
