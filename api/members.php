
<?php
require_once 'db.php';
require_once 'mail_sender.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    try {
        $before = null;
        if (isset($data['id'])) {
            $stmt = $pdo->prepare("SELECT * FROM members WHERE id = ?");
            $stmt->execute([$data['id']]);
            $before = $stmt->fetch();
        }

        // Check duplicate email and name
        $emailCheck = trim($data['email'] ?? '');
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
        if (isset($data['password']) && (!isset($before['password']) || $data['password'] !== $before['password'])) {
            $password = password_hash($data['password'], PASSWORD_BCRYPT);
        }

        $barcode = !empty($data['barcode']) ? trim($data['barcode']) : ('MBR-' . $data['id']);
        $image = $data['image'] ?? $data['photo'] ?? ($before['image'] ?? null);

        $stmt = $pdo->prepare("REPLACE INTO members (id, barcode, name, email, address, password, whatsapp, image, registrationDate, depositBalance, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        
        // Force APPROVED for new members, otherwise keep current status (or set to APPROVED if not specified)
        $status = $before ? ($data['status'] ?? $before['status']) : 'APPROVED';
        
        $stmt->execute([
            $data['id'], 
            $barcode,
            $data['name'], 
            $data['email'], 
            $data['address'] ?? null, 
            $password,
            $data['whatsapp'], 
            $image,
            str_replace('T', ' ', $data['registrationDate']), 
            (float)($data['depositBalance'] ?? 0), 
            $status
        ]);

        // Sync to users table for login capability
        // Automatically ACTIVE because members are now auto-approved, unless suspended
        $userStatus = ($status === 'APPROVED') ? 'ACTIVE' : 'SUSPENDED';
        $stmtUser = $pdo->prepare("REPLACE INTO users (id, name, email, password, role, status) VALUES (?, ?, ?, ?, 'MEMBER', ?)");
        $stmtUser->execute([
            $data['id'],
            $data['name'],
            $data['email'],
            $password,
            $userStatus
        ]);

        // Kirim Email No-Reply beserta Lampiran Teks S&K dan Kebijakan Privasi
        if (!$before) {
            $to = $data['email'];
            $subject = "Selamat Bergabung & Lampiran Syarat & Ketentuan - Koperasi Syariah AIS";
            $loginLink = "https://admin.aiskoperasi.store/minimartpro/";
            
            $statusMsg = "Pendaftaran member Anda telah berhasil dan akun Anda sudah aktif.";
            $loginMsg = "Silakan login menggunakan email: " . $data['email'];

            $termsText = "--------------------------------------------------\n" .
                         "LAMPIRAN DOKUMEN LEGAL & REGULASI DATA PRIBADI\n" .
                         "KOPERASI SYARIAH AIS & MINIMARTPRO ERP\n" .
                         "--------------------------------------------------\n\n" .
                         "I. SYARAT & KETENTUAN PENGGUNAAN (TERMS OF SERVICE):\n" .
                         "1. Member bertanggung jawab penuh atas kerahasiaan password dan akun pribadi.\n" .
                         "2. Saldo deposit dikelola sesuai prinsip transaksi Syariah tanpa bunga (bebas riba) untuk kebutuhan belanja di Minimart Koperasi.\n" .
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
            
            // Mengirim email menggunakan helper backend
            sendNoReplyEmail($to, $subject, $message);
        }

        if ($before) {
            logActivity($pdo, $data['staffName'] ?? 'System', 'Membership', 'UPDATE_MEMBER', $data['id'], $before, $data);
        }

        sendResponse(["status" => "success", "message" => "Data member berhasil diperbarui"]);
    } catch (PDOException $e) {
        sendResponse(["status" => "error", "message" => "Gagal menyimpan member: " . $e->getMessage()], 500);
    }
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    try {
        $stmt = $pdo->prepare("SELECT * FROM members WHERE id = ?");
        $stmt->execute([$id]);
        $before = $stmt->fetch();

        if ($before) {
            $stmt = $pdo->prepare("UPDATE members SET status = 'INACTIVE' WHERE id = ?");
            $stmt->execute([$id]);
            logActivity($pdo, $_GET['staffName'] ?? 'System', 'Membership', 'DELETE_MEMBER', $id, $before, ['status' => 'INACTIVE']);
        }
        sendResponse(["status" => "success", "message" => "Member berhasil dihapus"]);
    } catch (PDOException $e) {
        sendResponse(["status" => "error", "message" => "Gagal menghapus member: " . $e->getMessage()], 500);
    }
}
