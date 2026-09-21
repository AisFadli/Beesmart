<?php
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $key = $_GET['key'] ?? null;
    if ($key) {
        $stmt = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key = ?");
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        sendResponse(['value' => json_decode($val, true) ?? $val]);
    } else {
        $stmt = $pdo->query("SELECT * FROM app_settings");
        $results = $stmt->fetchAll();
        $settings = [];
        foreach ($results as $row) {
            $settings[$row['setting_key']] = json_decode($row['setting_value'], true) ?? $row['setting_value'];
        }
        sendResponse($settings);
    }
}

if ($method === 'POST') {
    requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR']);
    $data = json_decode(file_get_contents("php://input"), true);
    try {
        foreach ($data as $key => $value) {
            if ($key === 'staffName' || $key === 'userRole') continue;
            $valStr = is_array($value) ? json_encode($value) : $value;
            $stmt = $pdo->prepare("REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)");
            $stmt->execute([$key, $valStr]);
            logActivity($pdo, $data['staffName'] ?? 'System', 'Settings', 'UPDATE_SETTING', $key, null, $value);
        }
        sendResponse(["status" => "success"]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}
