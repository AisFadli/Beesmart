<?php
/**
 * Base URL publik aplikasi untuk link yang dikirim lewat email.
 *
 * Satu-satunya sumber kebenaran: api/app_config.php (gitignored, per-environment).
 * - Mesin tester: https://beesmart.protechid.cloud/app
 * - Hosting produksi: https://beesmart.id/app
 *
 * Jika app_config.php tidak ada, fallback ke host+subfolder request saat ini.
 */
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Forbidden');
}

function getAppBaseUrl(): string
{
    $configPath = __DIR__ . '/app_config.php';
    $config = file_exists($configPath) ? require $configPath : [];
    if (is_array($config) && !empty($config['base_url'])) {
        return rtrim((string)$config['base_url'], '/');
    }

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    // Cegah header Host memasukkan path/skema berbahaya ke dalam link email.
    if (!preg_match('/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/', $host)) {
        $host = 'localhost';
    }
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    $apiPosition = strpos($requestUri, '/api/');
    $subfolder = $apiPosition === false ? '' : substr($requestUri, 0, $apiPosition);

    return $protocol . '://' . $host . rtrim($subfolder, '/');
}
