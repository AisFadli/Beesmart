<?php
/**
 * Router untuk PHP Built-in Server (php -S).
 * Memperkuat keamanan saat .htaccess tidak berlaku (Apache-only).
 *
 * Usage:
 *   php -S 0.0.0.0:8080 -t /path/minimartpro /path/minimartpro/router.php
 */

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH) ?: '/';

$blockedExact = [
    '/api/db.php',
    '/api/install.php',
];

if (in_array($path, $blockedExact, true)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'Forbidden';
    return true;
}

$filename = basename($path);
if ($filename !== '' && $filename[0] === '.') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'Forbidden';
    return true;
}

// Biarkan server built-in menangani request lainnya secara normal
return false;