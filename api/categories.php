<?php
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    try {
        $before = null;
        if (isset($data['id'])) {
            $stmt = $pdo->prepare("SELECT * FROM categories WHERE id = ?");
            $stmt->execute([$data['id']]);
            $before = $stmt->fetch();
        }

        $stmt = $pdo->prepare("REPLACE INTO categories (id, name, status) VALUES (?, ?, ?)");
        $status = $data['status'] ?? ($before ? $before['status'] : 'ACTIVE');
        $normalizedName = strtoupper(trim($data['name']));
        $stmt->execute([$data['id'], $normalizedName, $status]);

        if ($before) {
            logActivity($pdo, $data['staffName'] ?? 'System', 'Inventory', 'UPDATE_CATEGORY', $data['id'], $before, $data);
        }

        sendResponse(["status" => "success"]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    try {
        $stmt = $pdo->prepare("SELECT * FROM categories WHERE id = ?");
        $stmt->execute([$id]);
        $before = $stmt->fetch();

        if ($before) {
            $stmt = $pdo->prepare("UPDATE categories SET status = 'INACTIVE' WHERE id = ?");
            $stmt->execute([$id]);
            logActivity($pdo, $_GET['staffName'] ?? 'System', 'Inventory', 'DELETE_CATEGORY', $id, $before, ['status' => 'INACTIVE']);
        }
        sendResponse(["status" => "success"]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}