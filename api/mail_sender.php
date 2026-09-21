<?php
// Blokir akses langsung via HTTP (file ini hanya boleh di-include)
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Forbidden');
}

/**
 * Helper untuk pengiriman email via SMTP (PHPMailer)
 *
 * Konfigurasi SMTP ada di mail_config.php (tidak ikut git).
 * Kembalikan true jika terkirim, false jika gagal (detail dicatat di error_log).
 */

require_once __DIR__ . '/libs/phpmailer/Exception.php';
require_once __DIR__ . '/libs/phpmailer/PHPMailer.php';
require_once __DIR__ . '/libs/phpmailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

function sendNoReplyEmail($to, $subject, $message) {
    $config = require __DIR__ . '/mail_config.php';

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host       = $config['host'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $config['username'];
        $mail->Password   = $config['password'];
        $mail->Port       = (int)$config['port'];
        $mail->SMTPSecure = $config['secure'];
        $mail->CharSet    = 'UTF-8';

        // From harus sama dengan akun SMTP agar SPF/DKIM valid
        $mail->setFrom($config['from_email'], $config['from_name']);
        $mail->addAddress($to);
        $mail->isHTML(false);
        $mail->Subject = $subject;
        $mail->Body    = $message;

        $sent = $mail->send();
        error_log("Email Sender: Email terkirim ke $to dengan subjek: $subject");
        return $sent;
    } catch (PHPMailerException $e) {
        error_log("Email Sender: GAGAL kirim ke $to (subjek: $subject). Error: " . $mail->ErrorInfo);
        return false;
    } catch (Throwable $e) {
        error_log("Email Sender: GAGAL kirim ke $to (subjek: $subject). Error: " . $e->getMessage());
        return false;
    }
}