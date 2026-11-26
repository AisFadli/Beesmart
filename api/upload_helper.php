<?php
/**
 * Helper validasi & penyimpanan file unggahan.
 * Dipakai oleh upload.php agar logic keamanan tidak menumpuk di endpoint.
 */

if (isset($_SERVER['REQUEST_METHOD']) && ($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(403);
    exit('Forbidden');
}

/** @return array{extension:string, mime:string} */
function validateUpload(array $file): array
{
    $allowedExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'];
    $allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    $maxSize = 5 * 1024 * 1024;

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        sendResponse(["status" => "error", "message" => "Gagal mengunggah file (error " . $file['error'] . ")."], 400);
    }
    if (($file['size'] ?? 0) > $maxSize) {
        sendResponse(["status" => "error", "message" => "Ukuran file maksimal 5 MB."], 400);
    }

    $tmp = (string)($file['tmp_name'] ?? '');
    $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExt, true)) {
        sendResponse(["status" => "error", "message" => "Ekstensi file tidak diizinkan. Gunakan jpg/png/webp/gif/pdf."], 400);
    }

    $mime = '';
    if (function_exists('finfo_open') && $tmp !== '' && is_file($tmp)) {
        $fInfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = (string)finfo_file($fInfo, $tmp);
        finfo_close($fInfo);
    } else {
        $mime = (string)($file['type'] ?? '');
    }
    if (!in_array(strtolower($mime), $allowedMime, true)) {
        sendResponse(["status" => "error", "message" => "Tipe file tidak valid."], 400);
    }

    $handle = @fopen($tmp, 'rb');
    $header = $handle ? (string)fread($handle, 16) : '';
    if ($handle) fclose($handle);

    $signatureOk = false;
    switch ($ext) {
        case 'jpg':
        case 'jpeg':
            $signatureOk = substr($header, 0, 3) === "\xFF\xD8\xFF";
            break;
        case 'png':
            $signatureOk = substr($header, 0, 8) === "\x89PNG\r\n\x1a\n";
            break;
        case 'gif':
            $signatureOk = substr($header, 0, 6) === 'GIF87a' || substr($header, 0, 6) === 'GIF89a';
            break;
        case 'webp':
            $signatureOk = strlen($header) >= 12 && substr($header, 0, 4) === 'RIFF' && substr($header, 8, 4) === 'WEBP';
            break;
        case 'pdf':
            $signatureOk = substr($header, 0, 5) === '%PDF-';
            break;
    }
    if (!$signatureOk) {
        sendResponse(["status" => "error", "message" => "Format file tidak sesuai dengan ekstensinya."], 400);
    }

    if (stripos($header, '<?php') !== false || stripos($header, '<?=') !== false || stripos($header, '<script') !== false) {
        sendResponse(["status" => "error", "message" => "File mengandung kode berbahaya."], 400);
    }
    $contents = file_get_contents($tmp);
    if ($contents !== false && preg_match('/<\?(php|=)/i', $contents)) {
        sendResponse(["status" => "error", "message" => "File mengandung kode berbahaya."], 400);
    }

    return ['extension' => $ext, 'mime' => strtolower($mime)];
}

/** Simpan file tervalidasi dan kembalikan path relatif untuk disimpan ke DB. */
function storeUpload(array $file, string $ext): string
{
    $tmp = (string)($file['tmp_name'] ?? '');
    $uploadDir = dirname(__DIR__) . '/uploads';

    if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0755, true)) {
        sendResponse(["status" => "error", "message" => "Gagal membuat folder uploads."], 500);
    }

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

    $filename = bin2hex(random_bytes(12)) . '.' . $ext;
    if (!move_uploaded_file($tmp, $uploadDir . '/' . $filename)) {
        sendResponse(["status" => "error", "message" => "Gagal menyimpan file."], 500);
    }

    return 'uploads/' . $filename;
}
