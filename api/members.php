
<?php
require_once 'db.php';
require_once 'mail_sender.php';
require_once 'app_url.php';
$auth = requireAuth(['ADMIN', 'STAFF', 'MEMBER']);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!is_array($data)) sendResponse(["status" => "error", "message" => "Data member tidak valid."], 400);

    // Otorisasi & anti-tamper: member hanya boleh mengubah profil dirinya sendiri,
    // dan tidak dapat mengubah saldo/status/barcode.
    $authRole = strtoupper($auth['role'] ?? '');
    $isStaff = in_array($authRole, ['ADMIN', 'STAFF'], true);
    if (!$isStaff) {
        $memberUid = preg_replace('/^(USER-|USR-)/i', '', trim((string)($auth['uid'] ?? '')));
        if (!in_array(($data['id'] ?? ''), [$auth['uid'] ?? '', $memberUid], true)) {
            sendResponse(["status" => "error", "message" => "Anda hanya dapat mengubah profil Anda sendiri."], 403);
        }
        unset($data['depositBalance'], $data['status'], $data['registrationDate'], $data['barcode']);
        $data['id'] = $memberUid;
    }

    try {
        $before = null;
        if (isset($data['id'])) {
            $stmt = $pdo->prepare("SELECT * FROM members WHERE id = ?");
            $stmt->execute([$data['id']]);
            $before = $stmt->fetch();
        }

        // Check duplicate email and name
        $emailCheck = trim((string)($data['email'] ?? ''));
        $nameCheck = trim($data['name'] ?? '');
        $memberId = $data['id'] ?? '';

        if (!empty($emailCheck)) {
            $stmtEmail = $pdo->prepare("SELECT COUNT(*) FROM members WHERE email = ? AND id != ?");
            $stmtEmail->execute([$emailCheck, $memberId]);
            if ($stmtEmail->fetchColumn() > 0) {
                sendResponse(["status" => "error", "message" => "Email sudah terdaftar. Silakan gunakan email lain atau gunakan fitur Lupa Password."], 400);
            }
        }

        if (!empty($nameCheck)) {
            $stmtName = $pdo->prepare("SELECT COUNT(*) FROM members WHERE name = ? AND id != ?");
            $stmtName->execute([$nameCheck, $memberId]);
            if ($stmtName->fetchColumn() > 0) {
                sendResponse(["status" => "error", "message" => "Nama sudah terdaftar. Silakan gunakan nama lengkap lain."], 400);
            }
        }

        // Handle password hashing if provided and changed
        $password = $data['password'] ?? ($before ? $before['password'] : null);
        // Proteksi double-hash: jika password yang dikirim sudah berupa hash bcrypt,
        // simpan apa adanya; hanya hash untuk plaintext baru.
        $isBcrypt = is_string($password) && preg_match('/^\$(2y|2a|2b|2x)\$\d{2}\$/', $password) === 1;
        if (isset($data['password']) && is_string($data['password']) && trim($data['password']) !== '' && !$isBcrypt && (!isset($before['password']) || $data['password'] !== $before['password'])) {
            $password = password_hash($data['password'], PASSWORD_BCRYPT);
        }
        if (is_string($password) && trim($password) === '') $password = $before['password'] ?? null;

        $barcode = $isStaff
            ? (!empty($data['barcode']) ? trim($data['barcode']) : ('MBR-' . $data['id']))
            : ($before['barcode'] ?? ('MBR-' . $data['id']));
        $image = $data['image'] ?? $data['photo'] ?? ($before['image'] ?? null);
        $registrationDate = $isStaff
            ? ($data['registrationDate'] ?? ($before['registrationDate'] ?? date('Y-m-d H:i:s')))
            : ($before['registrationDate'] ?? date('Y-m-d H:i:s'));
        $depositBalance = $isStaff
            ? (float)($data['depositBalance'] ?? ($before['depositBalance'] ?? 0))
            : (float)($before['depositBalance'] ?? 0);
        $memberType = $isStaff ? strtoupper((string)($data['memberType'] ?? ($before['memberType'] ?? 'ADULT'))) : strtoupper((string)($before['memberType'] ?? 'ADULT'));
        if (!in_array($memberType, ['ADULT', 'STUDENT'], true)) $memberType = 'ADULT';
        $nis = $isStaff ? (trim((string)($data['nis'] ?? ($before['nis'] ?? ''))) ?: null) : ($before['nis'] ?? null);
        $nisn = $isStaff ? (trim((string)($data['nisn'] ?? ($before['nisn'] ?? ''))) ?: null) : ($before['nisn'] ?? null);
        $className = $isStaff ? (trim((string)($data['className'] ?? ($before['className'] ?? ''))) ?: null) : ($before['className'] ?? null);
        $email = trim((string)($data['email'] ?? ($before['email'] ?? '')));
        $email = $email !== '' ? $email : null;
        $whatsapp = trim((string)($data['whatsapp'] ?? ($before['whatsapp'] ?? '')));
        $whatsapp = $whatsapp !== '' ? $whatsapp : null;

        // Force APPROVED for new members, otherwise keep current status (or set to APPROVED if not specified)
        $status = $before ? ($data['status'] ?? $before['status']) : 'APPROVED';
        $stmt = $pdo->prepare("INSERT INTO members (id, barcode, name, email, address, password, whatsapp, image, registrationDate, depositBalance, status, memberType, nis, nisn, className)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON DUPLICATE KEY UPDATE barcode = VALUES(barcode), name = VALUES(name), email = VALUES(email), address = VALUES(address), password = VALUES(password), whatsapp = VALUES(whatsapp), image = VALUES(image), registrationDate = VALUES(registrationDate), depositBalance = VALUES(depositBalance), status = VALUES(status), memberType = VALUES(memberType), nis = VALUES(nis), nisn = VALUES(nisn), className = VALUES(className)");
        $stmt->execute([
            $data['id'],
            $barcode,
            $data['name'],
            $email,
            $data['address'] ?? null,
            $password,
            $whatsapp,
            $image,
            str_replace('T', ' ', $registrationDate),
            $depositBalance,
            $status,
            $memberType,
            $nis,
            $nisn,
            $className
        ]);

        if ($before && strtolower((string)($before['email'] ?? '')) !== strtolower((string)$email)) {
            $pdo->prepare("DELETE FROM member_invitations WHERE memberId = ? AND usedAt IS NULL")->execute([$data['id']]);
        }

        if ($memberType !== 'STUDENT' && $email && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $userStmt = $pdo->prepare("SELECT id, role, status FROM users WHERE id = ? OR email = ? LIMIT 2");
            $userStmt->execute([$data['id'], $email]);
            $matchedUsers = $userStmt->fetchAll();
            if (count($matchedUsers) > 1) throw new Exception("Akun login dengan email ini perlu diperiksa.");
            $existingUser = $matchedUsers[0] ?? null;
            if ($existingUser && strtoupper((string)$existingUser['role']) !== 'MEMBER') throw new Exception("Email sudah digunakan akun non-member.");
            if ($password !== null && $password !== '') {
                $userStatus = ($status === 'APPROVED') ? 'ACTIVE' : 'SUSPENDED';
                $stmtUser = $pdo->prepare("INSERT INTO users (id, username, name, email, password, role, status) VALUES (?, NULL, ?, ?, ?, 'MEMBER', ?) ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), password = VALUES(password), role = 'MEMBER', status = VALUES(status)");
                $stmtUser->execute([$data['id'], $data['name'], $email, $password, $userStatus]);
                if ($before && ($password !== $before['password'] || $status !== $before['status'])) {
                    $pdo->prepare("UPDATE users SET tokenVersion = tokenVersion + 1 WHERE id = ?")->execute([$existingUser['id'] ?? $data['id']]);
                }
            } elseif ($existingUser) {
                $nextStatus = strtoupper((string)$existingUser['status']) === 'INVITED' ? 'INVITED' : (($status === 'APPROVED') ? 'ACTIVE' : 'SUSPENDED');
                $pdo->prepare("UPDATE users SET name = ?, email = ?, status = ? WHERE id = ?")->execute([$data['name'], $email, $nextStatus, $existingUser['id']]);
            }
        }

        // Kirim Email No-Reply beserta Lampiran Teks S&K dan Kebijakan Privasi
        if (!$before && $email && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $to = $email;
            $subject = "Selamat Bergabung & Lampiran Syarat & Ketentuan - Koperasi Syariah AIS";
            $loginLink = getAppBaseUrl() . '/';

            if ($memberType === 'STUDENT') {
                $statusMsg = "Pendaftaran member siswa Anda telah berhasil. Akun orang tua/wali akan menerima undangan aktivasi terpisah.";
                $loginMsg = "Email ini digunakan sebagai identitas keanggotaan siswa.";
            } elseif ($password === null || $password === '') {
                $statusMsg = "Pendaftaran member Anda telah berhasil. Silakan tunggu email undangan aktivasi akun.";
                $loginMsg = "Email yang terdaftar: " . $email;
            } else {
                $statusMsg = "Pendaftaran member Anda telah berhasil dan akun Anda sudah aktif.";
                $loginMsg = "Silakan login menggunakan email: " . $email;
            }

            $termsText = "--------------------------------------------------\n" .
                         "LAMPIRAN DOKUMEN LEGAL & REGULASI DATA PRIBADI\n" .
                         "KOPERASI SYARIAH AIS & BEESMART ERP\n" .
                         "--------------------------------------------------\n\n" .
                         "I. SYARAT & KETENTUAN PENGGUNAAN (TERMS OF SERVICE):\n" .
                         "1. Member bertanggung jawab penuh atas kerahasiaan password dan akun pribadi.\n" .
                         "2. Saldo deposit dikelola sesuai prinsip transaksi Syariah tanpa bunga (bebas riba) untuk kebutuhan belanja di BeeSmart Koperasi.\n" .
                         "3. Setiap transaksi akan mencatat nota digital (e-receipt) serta riwayat audit secara aman.\n" .
                         "4. Pengelola berhak menangguhkan akun apabila ditemukan manipulasi data atau tindakan merugikan.\n\n" .
                         "II. KEBIJAKAN PRIVASI & PERLINDUNGAN DATA PRIBADI (UU PDP NO. 27/2022):\n" .
                         "1. Data Pribadi yang dikumpulkan: Nama Lengkap, No. WhatsApp, Email, Alamat, Foto Profil, serta Riwayat Transaksi & Saldo Deposit.\n" .
                         "2. Tujuan Pengolahan: Identifikasi keanggotaan, pencetakan kartu member, verifikasi transaksi POS, dan komunikasi layanan resmi.\n" .
                         "3. Keamanan Data: Password dienkripsi dengan standar BCRYPT. Data pribadi TIDAK AKAN diperjualbelikan atau dibagikan ke pihak luar non-afiliasi.\n" .
                         "4. Hak Member: Member berhak mengakses, memperbarui profil, dan meminta salinan regulasi data kapan saja.\n" .
                         "--------------------------------------------------";

            $message = "Halo " . $data['name'] . ",\n\n" .
                      $statusMsg . "\n" .
                      $loginMsg . "\n" .
                      "Barcode / No. Kartu Member: " . $barcode . "\n" .
                      "Link Login Dashboard: " . $loginLink . "\n\n" .
                      "Berikut kami lampirkan dokumen Syarat & Ketentuan serta Kebijakan Privasi penggunaan data pribadi yang telah Anda setujui saat pendaftaran:\n\n" .
                      $termsText . "\n\n" .
                      "Informasi lebih lanjut & Layanan Administrasi Koperasi:\n" .
                      "WhatsApp: +62 881-0257-23947 (Bpk. Teguh)\n\n" .
                      "Hormat kami,\nTim Koperasi Syariah AIS";

            // Mengirim email menggunakan helper backend (gagal kirim tidak menggagalkan simpan data)
            $emailSent = sendNoReplyEmail($to, $subject, $message);
            if (!$emailSent) {
                error_log("Members: Email notifikasi gagal dikirim ke $to (data member tetap tersimpan).");
            }
        }

        if ($before) {
            logActivity($pdo, $auth['name'] ?? 'System', 'Membership', 'UPDATE_MEMBER', $data['id'], $before, $data);
        }

        sendResponse(["status" => "success", "message" => "Data member berhasil diperbarui"]);
    } catch (PDOException $e) {
        sendResponse(["status" => "error", "message" => "Gagal menyimpan member: " . $e->getMessage()], 500);
    }
}

if ($method === 'DELETE') {
    requireAuth(['ADMIN', 'STAFF']);
    $id = $_GET['id'] ?? '';
    try {
        $stmt = $pdo->prepare("SELECT * FROM members WHERE id = ?");
        $stmt->execute([$id]);
        $before = $stmt->fetch();

        if ($before) {
            $stmt = $pdo->prepare("UPDATE members SET status = 'INACTIVE' WHERE id = ?");
            $stmt->execute([$id]);
            logActivity($pdo, $auth['name'] ?? 'System', 'Membership', 'DELETE_MEMBER', $id, $before, ['status' => 'INACTIVE']);
        }
        sendResponse(["status" => "success", "message" => "Member berhasil dihapus"]);
    } catch (PDOException $e) {
        sendResponse(["status" => "error", "message" => "Gagal menghapus member: " . $e->getMessage()], 500);
    }
}
