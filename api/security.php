<?php
/**
 * SECURITY MIDDLEWARE — Anti-RCE & Request Hardening
 * Include di awal db.php SEBELUM memproses request apapun.
 *
 * Perlindungan:
 * 1. Blokir payload RCE di query string, body, dan header
 * 2. Limit request body size
 * 3. Blokir path traversal
 * 4. Blokir User-Agent scanner/bot berbahaya
 * 5. Security headers
 *
 * Perbaikan: pemeriksaan berbasis konteks. Catatan produk/nama member yang
 * mengandung kata seperti "eval(" tidak lagi langsung diblokir; pola berbahaya
 * hanya dicocokkan pada URL/header atau kombinasi eksploit nyata di body.
 */

if (isset($_SERVER['REQUEST_METHOD']) && ($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(403);
    exit('Forbidden');
}

/** Catat dan tolak request. */
function blockRequest(string $reason): void
{
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(["status" => "error", "message" => "Request diblokir oleh firewall."]);

    $logDir = dirname(__DIR__) . '/logs';
    if (!is_dir($logDir)) @mkdir($logDir, 0750, true);
    $logFile = $logDir . '/security_' . date('Y-m') . '.log';
    $logEntry = date('Y-m-d H:i:s') . ' | ' .
        ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . ' | ' .
        ($_SERVER['REQUEST_METHOD'] ?? '?') . ' ' . ($_SERVER['REQUEST_URI'] ?? '') . ' | ' .
        'BLOCKED: ' . $reason . "\n";
    @file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
    exit;
}

/**
 * Deteksi payload mencurigakan berdasarkan konteks.
 *
 * @param string $context 'url' | 'header' | 'body'
 */
function payloadLooksMalicious(string $value, string $context = 'url'): bool
{
    if ($value === '') return false;
    $v = urldecode($value);

    // Selalu diblokir di semua konteks.
    $always = [
        '/(php:\/\/input|php:\/\/filter|data:\/\/|expect:\/\/|phar:\/\/)/i',
        '/\x00/',
        '/(c99|r57|b374k|wso|alfa|filesman|mini\s*shell)/i',
    ];
    foreach ($always as $pattern) {
        if (preg_match($pattern, $v)) return true;
    }

    // URL/header: pola klasik memang tidak boleh muncul.
    if ($context === 'url' || $context === 'header') {
        $patterns = [
            '/(<\?php|<\?=)/i',
            '/\b(eval|exec|system|passthru|shell_exec|popen|proc_open|pcntl_exec)\s*\(/i',
            '/`[^`]*`/',
            '/base64_decode\s*\(/i',
            '/preg_replace\s*\(.*\/[a-z]*e[a-z]*\s*,/i',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $v)) return true;
        }
        return false;
    }

    // Body: hanya blokir kombinasi yang benar-benar eksploit.
    if (preg_match('/<\?(php|=)/i', $v)) return true;
    if (preg_match('/\b(eval|assert|system|shell_exec|passthru|proc_open|popen)\s*\(\s*\$?[\'"]?\s*\$?_(GET|POST|REQUEST|COOKIE)/i', $v)) return true;
    if (preg_match('/\b(file_put_contents|fopen|include|require)\s*\([^)]*(\bphp:\/\/|\bdata:\/\/)/i', $v)) return true;
    if (preg_match('/\b(base64_decode|gzinflate)\s*\(\s*\$?[\'"]?[A-Za-z0-9+\/=]{40,}/i', $v)) return true;

    return false;
}

// === 1. LIMIT REQUEST BODY SIZE (max 10 MB) ===
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 10 * 1024 * 1024) {
    http_response_code(413);
    header('Content-Type: application/json');
    echo json_encode(["status" => "error", "message" => "Request body terlalu besar."]);
    exit;
}

// === 2. BLOKIR PATH TRAVERSAL ===
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
if (preg_match('/\.\.[\/\\\\]/', $requestUri) || preg_match('/%2e%2e[\/\\\\%]/i', $requestUri)) {
    blockRequest('path traversal');
}

// === 3. QUERY STRING & GET PARAMS ===
if (payloadLooksMalicious($requestUri, 'url') || payloadLooksMalicious($_SERVER['QUERY_STRING'] ?? '', 'url')) {
    blockRequest('RCE pattern pada URL');
}
foreach ($_GET as $val) {
    if (is_string($val) && payloadLooksMalicious($val, 'url')) {
        blockRequest('RCE pattern pada GET parameter');
    }
}

// === 4. BLOKIR USER-AGENT SCANNER/BOT BERBAHAYA ===
$blockedAgents = [
    'sqlmap', 'nikto', 'nessus', 'openvas', 'w3af', 'acunetix',
    'nmap', 'masscan', 'zgrab', 'gobuster', 'dirbuster', 'wpscan',
    'havij', 'commix', 'nuclei', 'httpx', 'subfinder',
];
$uaLower = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
foreach ($blockedAgents as $blocked) {
    if (strpos($uaLower, $blocked) !== false) {
        blockRequest('scanner user-agent');
    }
}

// === 5. SECURITY HEADERS ===
if (php_sapi_name() !== 'cli') {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
}

// === 6. CEK BODY (JSON & form-data) ===
if (in_array($_SERVER['REQUEST_METHOD'] ?? '', ['POST', 'PUT', 'PATCH'], true)) {
    $rawBody = file_get_contents('php://input');
    if ($rawBody !== false && $rawBody !== '') {
        $decoded = json_decode($rawBody, true);
        if (is_array($decoded)) {
            $stack = [$decoded];
            while ($stack) {
                $item = array_pop($stack);
                foreach ($item as $value) {
                    if (is_array($value)) {
                        $stack[] = $value;
                    } elseif (is_string($value) && payloadLooksMalicious($value, 'body')) {
                        blockRequest('RCE pattern pada body');
                    }
                }
            }
        } elseif (payloadLooksMalicious($rawBody, 'body')) {
            blockRequest('RCE pattern pada body');
        }
    }
    foreach ($_POST as $val) {
        if (is_string($val) && payloadLooksMalicious($val, 'body')) {
            blockRequest('RCE pattern pada form body');
        }
    }
}
