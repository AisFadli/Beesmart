<?php
/**
 * Pendaftaran Member publik (tanpa login).
 * Hanya membuat akun member baru + sinkron ke tabel users (role MEMBER).
 * Profile member lainnya diubah melalui members.php (wajib login & verifikasi role).
 */
require_once 'db.php';
require_once 'mail_sender.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}

$data = json_decode(file_get_contents('php://input'), true);

$name = trim($data['name'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$whatsapp = trim($data['whatsapp'] ?? '');
$address = trim($data['address'] ?? '');
$password = $data['password'] ?? '';

if (empty($name) || empty($email)) {
    sendResponse(["status" => "error", "message" => "Nama dan email wajib diisi."], 400);
}
if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    sendResponse(["status" => "error", "message" => "Format email tidak valid."], 400);
}
if (!is_string($password) || strlen($password) < 6) {
    sendResponse(["status" => "error", "message" => "Password minimal 6 karakter."], 400);
}

try {
    $pdo->beginTransaction();

    $stmtEmail = $pdo->prepare("SELECT COUNT(*) FROM members WHERE email = ?");
    $stmtEmail->execute([$email]);
    if ($stmtEmail->fetchColumn() > 0) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => "Email sudah terdaftar. Silakan gunakan email lain atau gunakan fitur Lupa Password."], 400);
    }
    $stmtEmail2 = $pdo->prepare("SELECT COUNT(*) FROM users WHERE email = ?");
    $stmtEmail2->execute([$email]);
    if ($stmtEmail2->fetchColumn() > 0) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => "Email sudah terdaftar. Silakan gunakan email lain atau gunakan fitur Lupa Password."], 400);
    }
    $stmtName = $pdo->prepare("SELECT COUNT(*) FROM members WHERE name = ?");
    $stmtName->execute([$name]);
    if ($stmtName->fetchColumn() > 0) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => "Nama sudah terdaftar. Silakan gunakan nama lengkap lain."], 400);
    }

    $id = 'MEM-' . time() . '-' . rand(100, 999);
    $barcode = 'MBR-' . $id;
    $hashed = password_hash($password, PASSWORD_BCRYPT);

    $stmt = $pdo->prepare("INSERT INTO members (id, barcode, name, email, address, password, whatsapp, registrationDate, depositBalance, status) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 0, 'APPROVED')");
    $stmt->execute([$id, $barcode, $name, $email, ($address !== '' ? $address : null), $hashed, $whatsapp]);

    $stmtUser = $pdo->prepare("INSERT INTO users (id, name, email, password, role, status) VALUES (?, ?, ?, ?, 'MEMBER', 'ACTIVE')");
    $stmtUser->execute([$id, $name, $email, $hashed]);

    $pdo->commit();

    // Email selamat datang + lampiran S&K / Kebijakan Privasi
    $to = $email;
    $subject = "Selamat Bergabung & Lampiran Syarat & Ketentuan - Koperasi Syariah AIS";
    $loginLink = "https://beesmart.id/app/";

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

    $message = "Halo " . $name . ",\n\n" .
               "Pendaftaran member Anda telah berhasil dan akun Anda sudah aktif.\n" .
               "Silakan login menggunakan email: " . $email . "\n" .
               "Barcode / No. Kartu Member: " . $barcode . "\n" .
               "Link Login Dashboard: " . $loginLink . "\n\n" .
               "Berikut kami lampirkan dokumen Syarat & Ketentuan serta Kebijakan Privasi penggunaan data pribadi yang telah Anda setujui saat pendaftaran:\n\n" .
               $termsText . "\n\n" .
               "Informasi lebih lanjut & Layanan Administrasi Koperasi:\n" .
               "WhatsApp: +62 881-0257-23947 (Bpk. Teguh)\n\n" .
               "Hormat kami,\nTim Koperasi Syariah AIS";

    $emailSent = sendNoReplyEmail($to, $subject, $message);
    if (!$emailSent) {
        error_log("register.php: Email notifikasi gagal dikirim ke $to (data tetap tersimpan).");
    }

    sendResponse(["status" => "success", "message" => "Pendaftaran berhasil! Akun Anda telah aktif. Silakan login."]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    sendResponse(["status" => "error", "message" => "Gagal mendaftar: " . $e->getMessage()], 500);
}