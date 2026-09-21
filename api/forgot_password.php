<?php
require_once 'db.php';
require_once 'mail_sender.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $action = $data['action'] ?? '';

    if ($action === 'request') {
        $email = trim($data['email'] ?? '');
        if (empty($email)) {
            sendResponse(["status" => "error", "message" => "Email wajib diisi."], 400);
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            // Jangan bocorkan validitas: balas generik
            sendResponse(["status" => "success", "message" => "Jika email terdaftar, link reset telah dikirim."]);
        }

        try {
            // Cari email di users (mencakup member yang sudah sinkron) lalu fallback ke members
            $stmt = $pdo->prepare("SELECT id, name, email FROM users WHERE email = ? LIMIT 1");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            if (!$user) {
                $stmtM = $pdo->prepare("SELECT id, name, email FROM members WHERE email = ? LIMIT 1");
                $stmtM->execute([$email]);
                $user = $stmtM->fetch();
            }

            // Cooldown per email (2 menit) agar tidak dipergunakan untuk spam email
            $stmtCnt = $pdo->prepare("SELECT COUNT(*) FROM password_resets WHERE email = ? AND created_at > ?");
            $stmtCnt->execute([$email, date('Y-m-d H:i:s', strtotime('-2 minutes'))]);
            if ($stmtCnt->fetchColumn() > 0) {
                // Jangan kirim email lagi; balas generik
                sendResponse(["status" => "success", "message" => "Jika email terdaftar, link reset telah dikirim."]);
            }

            if (!$user) {
                // Anti-enumerasi: tidak mengungkap email yang tidak terdaftar
                sendResponse(["status" => "success", "message" => "Jika email terdaftar, link reset telah dikirim."]);
            }

            // Generate secure token & rotasi: cabut semua token lama untuk email ini
            $token = bin2hex(random_bytes(32));
            $expires_at = date('Y-m-d H:i:s', strtotime('+1 hour'));

            $pdo->prepare("DELETE FROM password_resets WHERE email = ?")->execute([$email]);
            $stmtReset = $pdo->prepare("INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)");
            $stmtReset->execute([$email, $token, $expires_at]);

            // Construct reset link. Gunakan base_url dari app_config.php jika tersedia,
            // agar link email selalu mengarah ke domain publik (bukan localhost).
            $appConfig = (file_exists(__DIR__ . '/app_config.php')) ? require __DIR__ . '/app_config.php' : [];
            $link = null;

            if (!empty($appConfig['base_url'])) {
                $link = rtrim($appConfig['base_url'], '/') . "/?reset_token=$token";
            } else {
                $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? "https" : "http";
                $host = $_SERVER['HTTP_HOST'] ?? 'localhost:3000';

                // Extract subdirectory from REQUEST_URI if api is called in a subfolder
                $request_uri = $_SERVER['REQUEST_URI'] ?? '';
                $api_pos = strpos($request_uri, '/api/');
                $subfolder = '';
                if ($api_pos !== false) {
                    $subfolder = substr($request_uri, 0, $api_pos);
                }

                $link = "$protocol://$host" . $subfolder . "/?reset_token=$token";
            }

            // Send email
            $subject = "Permintaan Reset Password BeeSmart";
            $message = "Halo " . $user['name'] . ",\n\n"
                     . "Anda menerima email ini karena kami menerima permintaan perubahan password untuk akun Anda di BeeSmart.\n\n"
                     . "Silakan klik link di bawah ini untuk merubah password Anda:\n"
                     . $link . "\n\n"
                     . "Link ini berlaku selama 1 jam dan hanya dapat digunakan sekali. Jika Anda tidak meminta perubahan ini, abaikan email ini.\n\n"
                     . "Salam hangat,\n"
                     . "BeeSmart Team";

            $sent = sendNoReplyEmail($email, $subject, $message);
            if (!$sent) {
                error_log("forgot_password: gagal mengirim email reset ke $email");
                // Tetap balas sukses agar tidak membocorkan detail (user bisa coba lagi setelah cooldown)
            }

            sendResponse(["status" => "success", "message" => "Jika email terdaftar, link reset telah dikirim."]);
        } catch (Exception $e) {
            sendResponse(["status" => "error", "message" => "Gagal mengirim link reset: " . $e->getMessage()], 500);
        }
    } 
    
    else if ($action === 'reset') {
        $token = trim($data['token'] ?? '');
        $password = $data['password'] ?? '';
        $confirm_password = $data['confirm_password'] ?? '';

        if (empty($token)) {
            sendResponse(["status" => "error", "message" => "Token tidak valid."], 400);
        }
        if (empty($password) || empty($confirm_password)) {
            sendResponse(["status" => "error", "message" => "Password baru dan konfirmasi wajib diisi."], 400);
        }
        if ($password !== $confirm_password) {
            sendResponse(["status" => "error", "message" => "Password dan konfirmasi password tidak cocok."], 400);
        }

        try {
            // Check token validity and expiration
            $now = date('Y-m-d H:i:s');
            $stmtToken = $pdo->prepare("SELECT email FROM password_resets WHERE token = ? AND expires_at > ? LIMIT 1");
            $stmtToken->execute([$token, $now]);
            $reset = $stmtToken->fetch();

            if (!$reset) {
                sendResponse(["status" => "error", "message" => "Link reset password tidak valid atau sudah kedaluwarsa."], 400);
            }

            $email = $reset['email'];

            // Hash the password securely
            $hashed_password = password_hash($password, PASSWORD_BCRYPT);

            $pdo->beginTransaction();

            // 1. Update users table
            $stmtUser = $pdo->prepare("UPDATE users SET password = ? WHERE email = ?");
            $stmtUser->execute([$hashed_password, $email]);
            $usersAffected = $stmtUser->rowCount();

            // 2. Update members table (if they are a member)
            $stmtMember = $pdo->prepare("UPDATE members SET password = ? WHERE email = ?");
            $stmtMember->execute([$hashed_password, $email]);
            $membersAffected = $stmtMember->rowCount();

            if ($usersAffected === 0 && $membersAffected === 0) {
                $pdo->rollBack();
                sendResponse(["status" => "error", "message" => "Akun tidak ditemukan."], 400);
            }

            // 3. Cabut SEMUA token aktif untuk email tersebut (one-time use)
            $pdo->prepare("DELETE FROM password_resets WHERE email = ?")->execute([$email]);

            $pdo->commit();

            // Send notification email
            $subject = "Notifikasi Perubahan Password Berhasil";
            $message = "Halo,\n\n"
                     . "Kami menginfokan bahwa pada tanggal " . date('d-m-Y H:i:s') . " (WIB) akun BeeSmart Anda dengan email " . $email . " telah berhasil melakukan perubahan password.\n\n"
                     . "Jika Anda tidak melakukan perubahan ini, segera hubungi Admin kami.\n\n"
                     . "Salam hangat,\n"
                     . "BeeSmart Team";

            sendNoReplyEmail($email, $subject, $message);

            sendResponse(["status" => "success", "message" => "Password Anda berhasil diperbarui. Silakan login kembali dengan password baru."]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            sendResponse(["status" => "error", "message" => "Gagal memperbarui password: " . $e->getMessage()], 500);
        }
    } 
    
    else {
        sendResponse(["status" => "error", "message" => "Aksi tidak dikenali."], 400);
    }
} else {
    sendResponse(["status" => "error", "message" => "Method not allowed."], 405);
}
