<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR']);
$authRole = strtoupper($auth['role'] ?? '');

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        if ($authRole === 'ADMIN') {
            $stmt = $pdo->query("SELECT * FROM users ORDER BY name ASC");
        } else {
            $stmt = $pdo->query("SELECT id, name, email, role, status FROM users WHERE status = 'ACTIVE' OR status IS NULL ORDER BY name ASC");
        }
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
        if ($authRole !== 'ADMIN') {
            sendResponse(["status" => "error", "message" => "Akses ditolak."], 403);
        }

        $data = json_decode(file_get_contents("php://input"), true);
        if (!is_array($data)) sendResponse(["status" => "error", "message" => "Data tidak valid."], 400);

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
            sendResponse(["status" => "error", "message" => "Nama dan Email wajib diisi."], 400);
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            sendResponse(["status" => "error", "message" => "Format email tidak valid."], 400);
        }
        if (!in_array($role, ['ADMIN', 'STAFF', 'TENANT'], true) || !in_array($status, ['ACTIVE', 'INACTIVE'], true)) {
            sendResponse(["status" => "error", "message" => "Role atau status akun tidak valid."], 400);
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
                if (!is_string($password) || strlen($password) < 8) {
                    sendResponse(["status" => "error", "message" => "Password minimal 8 karakter."], 400);
                }
                $hashed = password_hash($password, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, role = ?, status = ?, tenantCategories = ?, password = ?, tokenVersion = tokenVersion + 1 WHERE id = ?");
                $stmt->execute([$name, $email, $role, $status, $tenantCategories, $hashed, $id]);
            } else {
                $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, role = ?, status = ?, tenantCategories = ?, tokenVersion = tokenVersion + 1 WHERE id = ?");
                $stmt->execute([$name, $email, $role, $status, $tenantCategories, $id]);
            }
            sendResponse(["status" => "success", "message" => "Data user berhasil diperbarui"]);
        } else {
            if (!is_string($password) || strlen($password) < 8) {
                sendResponse(["status" => "error", "message" => "Password minimal 8 karakter."], 400);
            }
            $hashed = password_hash($password, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare("INSERT INTO users (id, email, name, role, status, tenantCategories, password) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$id, $email, $name, $role, $status, $tenantCategories, $hashed]);
            sendResponse(["status" => "success", "message" => "User baru berhasil ditambahkan"]);
        }
    } elseif ($method === 'DELETE') {
        if ($authRole !== 'ADMIN') {
            sendResponse(["status" => "error", "message" => "Akses ditolak."], 403);
        }
        $id = $_GET['id'] ?? '';
        if (empty($id)) throw new Exception("ID User tidak ditemukan");
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? AND role != 'ADMIN'");
        $stmt->execute([$id]);
        sendResponse(["status" => "success", "message" => "User berhasil dihapus"]);
    }
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
