<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR']);

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

try {
    if ($method === 'POST') {
        $action = $data['action'] ?? 'save';
        
        if ($action === 'save') {
            $id = $data['id'] ?? ('EXP-' . date('Ymd') . '-' . substr(uniqid(), -4));
            $date = $data['date'] ?? date('Y-m-d');
            $description = $data['description'] ?? '';
            $category = strtoupper(trim($data['category'] ?? 'General'));
            $amount = (float)($data['amount'] ?? 0);
            $staffId = $data['staffId'] ?? 'Unknown';
            $status = $data['status'] ?? 'NORMAL';

            $stmt = $pdo->prepare("REPLACE INTO expenses (id, date, description, category, amount, staffId, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$id, $date, $description, $category, $amount, $staffId, $status]);
            
            sendResponse(["status" => "success", "id" => $id]);
        } elseif ($action === 'cancel') {
            $id = $data['id'];
            $stmt = $pdo->prepare("UPDATE expenses SET status = 'CANCELLED' WHERE id = ?");
            $stmt->execute([$id]);
            sendResponse(["status" => "success"]);
        }
    } elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? '';
        if ($id) {
            $stmt = $pdo->prepare("DELETE FROM expenses WHERE id = ?");
            $stmt->execute([$id]);
            sendResponse(["status" => "success"]);
        }
    }
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
