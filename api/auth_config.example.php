<?php
/**
 * Konfigurasi Autentikasi API (Backend ONLY - tidak ikut commit)
 *
 * Salin file ini menjadi api/auth_config.php lalu isi 'secret' dengan
 * string acak 64 karakter hex. Secret dipakai untuk menandatangani token
 * login (HMAC-SHA256). Jangan bagikan dan jangan commit file aslinya.
 *
 *   cp api/auth_config.example.php api/auth_config.php
 *   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
 */

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Forbidden');
}

return [
    'secret' => 'GANTI_DENGAN_RANDOM_64_HEX',
    'ttl'    => 43200, // Masa berlaku token dalam detik (12 jam)
];
