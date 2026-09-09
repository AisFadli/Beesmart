<?php
/**
 * Helper untuk pengiriman email via SMTP atau PHP Mail
 */

function sendNoReplyEmail($to, $subject, $message) {
    // --- KONFIGURASI SMTP ANDA (BACKEND ONLY) ---
    $smtp_config = [
        'host' => 'smtp.gmail.com',        // Ganti dengan host SMTP Anda
        'port' => 587,                     // 587 untuk TLS, 465 untuk SSL
        'user' => 'emailanda@gmail.com',   // Ganti dengan email SMTP Anda
        'pass' => 'xxxx xxxx xxxx xxxx',   // Ganti dengan App Password (bukan password email)
        'from_name' => 'MinimartPro ERP',
        'from_email' => 'no-reply@aiskoperasi.store'
    ];

    $headers = "MIME-Version: 1.0" . "\r\n";
    $headers .= "Content-type:text/plain;charset=UTF-8" . "\r\n";
    $headers .= "From: " . $smtp_config['from_name'] . " <" . $smtp_config['from_email'] . ">" . "\r\n";
    $headers .= "Reply-To: " . $smtp_config['from_email'] . "\r\n";
    $headers .= "X-Mailer: PHP/" . phpversion();

    // Log simulasi untuk environment bantuan AI
    error_log("Email Sender: Mengirim email ke $to dengan subjek: $subject");
    
    // Perintah kirim (Jika di hosting cPanel biasanya fungsi mail() sudah cukup jika SPF/DKIM aktif)
    // Jika ingin menggunakan PHPMailer (Lebih stabil), Anda perlu mengupload library PHPMailer ke folder /api/libs
    return mail($to, $subject, $message, $headers);
}
