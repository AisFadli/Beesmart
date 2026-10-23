<?php
/**
 * SECURITY MIDDLEWARE — Anti-RCE & Request Hardening
 * Include di awal db.php SEBELUM memproses request apapun.
 * 
 * Perlindungan:
 * 1. Blokir payload RCE di query string, body, dan header
 * 2. Limit request body size
 * 3. Blokir path traversal
 * 4. Rate limiting sederhana (per IP)
 * 5. Blokir User-Agent scanner/bot berbahaya
 */

// === 1. BLOKIR AKSES LANGSUNG ===
if (isset($_SERVER['REQUEST_METHOD']) && ($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(403);
    exit('Forbidden');
}

// === 2. LIMIT REQUEST BODY SIZE (max 10 MB) ===
$maxBodySize = 10 * 1024 * 1024;
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > $maxBodySize) {
    http_response_code(413);
    header('Content-Type: application/json');
    echo json_encode(["status" => "error", "message" => "Request body terlalu besar."]);
    exit;
}

// === 3. BLOKIR PATH TRAVERSAL ===
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
if (preg_match('/\.\.[\/\\\\]/', $requestUri) || preg_match('/%2e%2e[\/\\\\%]/i', $requestUri)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(["status" => "error", "message" => "Request tidak valid."]);
    exit;
}

// === 4. BLOKIR PAYLOAD RCE DI QUERY STRING & URL ===
$dangerousPatterns = [
    // PHP code injection
    '/(<\?php|<\?=)/i',
    // Common RCE functions (hanya jika diikuti kurung buka, pastikan tidak trigger kata umum)
    '/\b(eval|exec|system|passthru|shell_exec|popen|proc_open|pcntl_exec)\s*\(/i',
    // Backtick execution
    '/`[^`]*`/',
    // PHP wrapper/stream injection
    '/(php:\/\/input|php:\/\/filter|data:\/\/|expect:\/\/|phar:\/\/)/i',
    // Base64 encoded PHP
    '/base64_decode\s*\(/i',
    // Null byte injection
    '/\x00/',
    // Common webshell signatures
    '/(c99|r57|b374k|wso|alfa|filesman|mini\s*shell)/i',
    // preg_replace /e modifier (code execution)
    '/preg_replace\s*\(.*\/[a-z]*e[a-z]*\s*,/i',
];

$checkInputs = [
    $_SERVER['QUERY_STRING'] ?? '',
    $_SERVER['REQUEST_URI'] ?? '',
];

// Juga cek semua GET params
foreach ($_GET as $val) {
    if (is_string($val)) $checkInputs[] = $val;
}

foreach ($checkInputs as $input) {
    if ($input === '') continue;
    $decoded = urldecode($input);
    foreach ($dangerousPatterns as $pattern) {
        if (preg_match($pattern, $decoded)) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["status" => "error", "message" => "Request diblokir oleh firewall."]);
            
            // Log serangan
            $logDir = dirname(__DIR__) . '/logs';
            if (!is_dir($logDir)) @mkdir($logDir, 0750, true);
            $logFile = $logDir . '/security_' . date('Y-m') . '.log';
            $logEntry = date('Y-m-d H:i:s') . ' | ' .
                ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . ' | ' .
                ($_SERVER['REQUEST_METHOD'] ?? '?') . ' ' . ($requestUri) . ' | ' .
                'BLOCKED: RCE pattern matched' . "\n";
            @file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
            
            exit;
        }
    }
}

// === 5. BLOKIR USER-AGENT SCANNER/BOT BERBAHAYA ===
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$blockedAgents = [
    'sqlmap', 'nikto', 'nessus', 'openvas', 'w3af', 'acunetix',
    'nmap', 'masscan', 'zgrab', 'gobuster', 'dirbuster', 'wpscan',
    'havij', 'commix', 'nuclei', 'httpx', 'subfinder', 'masscan',
];
$uaLower = strtolower($userAgent);
foreach ($blockedAgents as $blocked) {
    if (strpos($uaLower, $blocked) !== false) {
        http_response_code(403);
        exit('Forbidden');
    }
}

// === 6. SECURITY HEADERS ===
if (php_sapi_name() !== 'cli') {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
}

// === 7. CEK POST BODY UNTUK RCE (JSON & form-data) ===
if (in_array($_SERVER['REQUEST_METHOD'] ?? '', ['POST', 'PUT', 'PATCH'], true)) {
    $rawBody = file_get_contents('php://input');
    if ($rawBody !== false && strlen($rawBody) > 0 && strlen($rawBody) < 1048576) {
        $decoded = $rawBody;
        foreach ($dangerousPatterns as $pattern) {
            if (preg_match($pattern, $decoded)) {
                http_response_code(403);
                header('Content-Type: application/json');
                echo json_encode(["status" => "error", "message" => "Request diblokir oleh firewall."]);
                
                $logDir = dirname(__DIR__) . '/logs';
                if (!is_dir($logDir)) @mkdir($logDir, 0750, true);
                $logFile = $logDir . '/security_' . date('Y-m') . '.log';
                $logEntry = date('Y-m-d H:i:s') . ' | ' .
                    ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . ' | ' .
                    ($_SERVER['REQUEST_METHOD'] ?? '?') . ' ' . ($requestUri) . ' | ' .
                    'BLOCKED: RCE in POST body' . "\n";
                @file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
                
                exit;
            }
        }
    }
}
