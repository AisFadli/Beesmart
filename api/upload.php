<?php
require_once 'db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}

$allowedExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'];
$allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
$maxSize = 5 * 1024 * 1024; // 5 MB

if (!isset($_FILES['file'])) {
    sendResponse(["status" => "error", "message" => "Tidak ada file yang diunggah."], 400);
}

$file = $_FILES['file'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    sendResponse(["status" => "error", "message" => "Gagal mengunggah file (error " . $file['error'] . ")."], 400);
}
if ($file['size'] > $maxSize) {
    sendResponse(["status" => "error", "message" => "Ukuran file maksimal 5 MB."], 400);
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, $allowedExt, true)) {
    sendResponse(["status" => "error", "message" => "Ekstensi file tidak diizinkan. Gunakan jpg/png/webp/gif/pdf."], 400);
}

$mime = '';
if (function_exists('finfo_open') && isset($file['tmp_name']) && is_file($file['tmp_name'])) {
    $fInfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($fInfo, $file['tmp_name']);
    finfo_close($fInfo);
} else {
    $mime = $file['type'] ?? '';
}
if (!in_array(strtolower($mime), $allowedMime, true)) {
    sendResponse(["status" => "error", "message" => "Tipe file tidak valid."], 400);
}

$filename = uniqid('proof_') . '.' . $ext;
$uploadDir = dirname(__DIR__) . '/uploads';

if (!is_dir($uploadDir)) {
    if (!@mkdir($uploadDir, 0755, true)) {
        sendResponse(["status" => "error", "message" => "Gagal membuat folder uploads."], 500);
    }
}

// Pastikan folder uploads tidak dapat mengeksekusi script PHP
$htaccessPath = $uploadDir . '/.htaccess';
if (!file_exists($htaccessPath)) {
    @file_put_contents($htaccessPath,
        "# Mencegah eksekusi script di dalam folder unggahan\n" .
        "<FilesMatch \"\\.(php|phtml|phar|php5|php7)$\">\n" .
        "    <IfModule mod_authz_core.c>\n" .
        "        Require all denied\n" .
        "    </IfModule>\n" .
        "    <IfModule !mod_authz_core.c>\n" .
        "        Order Allow,Deny\n" .
        "        Deny from all\n" .
        "    </IfModule>\n" .
        "</FilesMatch>\n");
}

if (move_uploaded_file($file['tmp_name'], $uploadDir . '/' . $filename)) {
    sendResponse(["status" => "success", "url" => 'uploads/' . $filename]);
} else {
    sendResponse(["status" => "error", "message" => "Gagal menyimpan file."], 500);
}