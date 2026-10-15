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
    $stmt = $pdo->prepare("SELECT id, email, name, role, tenantCategories, password FROM users WHERE email = ? AND status = 'ACTIVE' LIMIT 1");
    $stmt = $pdo->prepare("SELECT id, email, name, role, tenantCategories, password, tokenVersion FROM users WHERE email = ? AND status = 'ACTIVE' LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    $storedPassword = (string)($user['password'] ?? '');
    $tokenVersion = (int)($user['tokenVersion'] ?? 0);
    $passwordVerified = $user && password_verify($password, $storedPassword);
    $legacyPasswordVerified = $user && !$passwordVerified && hash_equals($storedPassword, (string)$password);
    if ($user && ($passwordVerified || $legacyPasswordVerified)) {
        if ($legacyPasswordVerified) {
            $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
            $pdo->prepare("UPDATE users SET password = ?, tokenVersion = tokenVersion + 1 WHERE id = ?")->execute([$hashedPassword, $user['id']]);
            $tokenVersion++;
        }
        unset($user['password']);
        if (isset($user['tenantCategories']) && $user['tenantCategories']) {
            $user['tenantCategories'] = json_decode($user['tenantCategories'], true) ?? [];
        } else {
            $user['tenantCategories'] = [];
        }
        $token = issueAuthToken($user['id'], $user['role'] ?? 'USER', $user['email'] ?? '', $tokenVersion);
        if ($token === null) {
            error_log("auth.php: api/auth_config.php belum dikonfigurasi (secret kosong).");
            sendResponse(["status" => "error", "message" => "Server autentikasi belum dikonfigurasi."], 500);
        }
        unset($user['tokenVersion']);
        $user['token'] = $token;
        sendResponse($user);
    } else {
        sendResponse(["status" => "error", "message" => "Email atau password salah."], 401);
    }
} catch (PDOException $e) {
    sendResponse(["status" => "error", "message" => "Server Database Error."], 500);
}
