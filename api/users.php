<?php
require_once 'db.php';
requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR']);

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM users ORDER BY name ASC");
        $users = $stmt->fetchAll();
        foreach ($users as &$u) {
            unset($u['password']);
            if (!isset($u['createdAt'])) {
                $u['createdAt'] = $u['created_at'] ?? date('Y-m-d H:i:s');
            }
            if (isset($u['tenantCategories']) && $u['tenantCategories']) {
                $u['tenantCategories'] = is_array($u['tenantCategories']) ? $u['tenantCategories'] : (json_decode($u['tenantCategories'], true) ?? []);
            } else {
                $u['tenantCategories'] = [];
            }
        }
        sendResponse($users);
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) throw new Exception("Data tidak valid");

        $id = $data['id'] ?? ('USR-' . time() . '-' . rand(100, 999));
        $email = trim($data['email'] ?? '');
        $name = trim($data['name'] ?? '');
        $role = strtoupper(trim($data['role'] ?? 'STAFF'));
        $status = strtoupper(trim($data['status'] ?? 'ACTIVE'));
        $password = $data['password'] ?? '';
        
        $tenantCategories = isset($data['tenantCategories']) && is_array($data['tenantCategories']) 
            ? json_encode(array_values(array_filter($data['tenantCategories']))) 
            : json_encode([]);

        if (empty($email) || empty($name)) {
            throw new Exception("Nama dan Email wajib diisi");
        }

        // Check duplicate email
        $stmtCheck = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
        $stmtCheck->execute([$email, $id]);
        if ($stmtCheck->fetch()) {
            throw new Exception("Email '$email' sudah digunakan oleh user lain.");
        }

        // Check existing user
        $stmtExist = $pdo->prepare("SELECT password FROM users WHERE id = ?");
        $stmtExist->execute([$id]);
        $existing = $stmtExist->fetch();

        if ($existing) {
            if (!empty($password)) {
                $hashed = password_hash($password, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, role = ?, status = ?, tenantCategories = ?, password = ? WHERE id = ?");
                $stmt->execute([$name, $email, $role, $status, $tenantCategories, $hashed, $id]);
            } else {
                $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, role = ?, status = ?, tenantCategories = ? WHERE id = ?");
                $stmt->execute([$name, $email, $role, $status, $tenantCategories, $id]);
            }
            sendResponse(["status" => "success", "message" => "Data user berhasil diperbarui"]);
        } else {
            if (empty($password)) {
                $password = '123456';
            }
            $hashed = password_hash($password, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare("INSERT INTO users (id, email, name, role, status, tenantCategories, password) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$id, $email, $name, $role, $status, $tenantCategories, $hashed]);
            sendResponse(["status" => "success", "message" => "User baru berhasil ditambahkan"]);
        }
    } elseif ($method === 'DELETE') {
        $id = $_GET['id'] ?? '';
        if (empty($id)) throw new Exception("ID User tidak ditemukan");
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? AND role != 'ADMIN'");
        $stmt->execute([$id]);
        sendResponse(["status" => "success", "message" => "User berhasil dihapus"]);
    }
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
