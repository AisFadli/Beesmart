<?php
require_once 'db.php';

// Mendapatkan data input dengan cara yang lebih aman
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Jika json_decode gagal, coba ambil dari $_POST (fallback)
if (is_null($data)) {
    $email = $_POST['email'] ?? '';
    $password = $_POST['password'] ?? '';
} else {
    $email = $data['email'] ?? '';
    $password = $data['password'] ?? '';
}

if (empty($email) || empty($password)) {
    sendResponse(["status" => "error", "message" => "Email dan password wajib diisi."], 400);
}

try {
    $identifier = trim($email);
    $stmt = $pdo->prepare("SELECT id, email, username, name, role, tenantCategories, password FROM users WHERE (email = ? OR username = ?) AND status = 'ACTIVE' LIMIT 1");
    $stmt->execute([$identifier, $identifier]);
    $user = $stmt->fetch();

    if ($user && (password_verify($password, $user['password']) || $password === $user['password'])) {
        unset($user['password']);
        if (isset($user['tenantCategories']) && $user['tenantCategories']) {
            $user['tenantCategories'] = json_decode($user['tenantCategories'], true) ?? [];
        } else {
            $user['tenantCategories'] = [];
        }
        $token = issueAuthToken($user['id'], $user['role'] ?? 'USER', $user['email'] ?? '');
        if ($token === null) {
            error_log("auth.php: api/auth_config.php belum dikonfigurasi (secret kosong).");
            sendResponse(["status" => "error", "message" => "Server autentikasi belum dikonfigurasi."], 500);
        }
        $user['token'] = $token;
        sendResponse($user);
    } else {
        sendResponse(["status" => "error", "message" => "Email/Username atau password salah."], 401);
    }
} catch (PDOException $e) {
    sendResponse(["status" => "error", "message" => "Server Database Error."], 500);
}
