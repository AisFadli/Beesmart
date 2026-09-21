<?php
/**
 * Auth guard terpusat (HMAC-SHA256 stateless token).
 *
 * Token = base64url(json{uid, role, email, exp}) . "." . hash_hmac('sha256', payload, secret)
 *
 * File ini hanya boleh di-include oleh endpoint API (melalui db.php).
 */

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Forbidden');
}

function authConfig() {
    static $config = null;
    if ($config === null) {
        $path = __DIR__ . '/auth_config.php';
        $config = file_exists($path) ? require $path : [];
        if (!is_array($config)) {
            $config = [];
        }
    }
    return $config;
}

function authSecret() {
    $config = authConfig();
    $secret = $config['secret'] ?? '';
    if (!is_string($secret) || $secret === '' || $secret === 'GANTI_DENGAN_RANDOM_64_HEX') {
        return null;
    }
    return $secret;
}

function authTtl() {
    $config = authConfig();
    $ttl = (int)($config['ttl'] ?? 43200);
    return $ttl > 0 ? $ttl : 43200;
}

function base64UrlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode($data) {
    return base64_decode(strtr($data, '-_', '+/'));
}

function issueAuthToken($uid, $role, $email = '') {
    $secret = authSecret();
    if ($secret === null) {
        return null;
    }
    $payload = base64UrlEncode(json_encode([
        'uid'   => (string)$uid,
        'role'  => strtoupper((string)$role),
        'email' => (string)$email,
        'exp'   => time() + authTtl(),
    ]));
    $sig = hash_hmac('sha256', $payload, $secret);
    return $payload . '.' . $sig;
}

function verifyAuthToken($token) {
    $secret = authSecret();
    if ($secret === null || !is_string($token) || strpos($token, '.') === false) {
        return null;
    }
    list($payload, $sig) = explode('.', $token, 2);
    $expected = hash_hmac('sha256', $payload, $secret);
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $data = json_decode(base64UrlDecode($payload), true);
    if (!is_array($data) || empty($data['uid']) || empty($data['exp']) || (int)$data['exp'] < time()) {
        return null;
    }
    return $data;
}

function getBearerToken() {
    $auth = '';
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (strtolower($key) === 'authorization') {
                $auth = $value;
                break;
            }
        }
    }
    if ($auth === '') {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    }
    if (stripos($auth, 'bearer ') === 0) {
        return trim(substr($auth, 7));
    }
    if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        return trim($_SERVER['HTTP_X_AUTH_TOKEN']);
    }
    return '';
}

/**
 * Wajib token valid. Jika $roles diberikan, role harus termasuk di dalamnya.
 * Hasil verifikasi disimpan di $GLOBALS['AUTH'].
 */
function requireAuth($roles = null) {
    $auth = verifyAuthToken(getBearerToken());
    if (!$auth) {
        sendResponse(["status" => "error", "message" => "Tidak terautentikasi. Silakan login kembali."], 401);
    }
    if (!empty($roles)) {
        $allowed = array_map('strtoupper', (array)$roles);
        if (!in_array(strtoupper($auth['role']), $allowed, true)) {
            sendResponse(["status" => "error", "message" => "Akses ditolak untuk role Anda."], 403);
        }
    }
    $GLOBALS['AUTH'] = $auth;
    return $auth;
}

function currentAuth() {
    return $GLOBALS['AUTH'] ?? null;
}
