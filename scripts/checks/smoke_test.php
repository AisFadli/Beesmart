<?php
/**
 * Smoke test endpoint API BeeSmart tanpa browser.
 *
 * Cara pakai:
 *   php scripts/checks/smoke_test.php                          # PHP server lokal :8088
 *   php scripts/checks/smoke_test.php http://127.0.0.1:8088
 *   BEESMART_BASE_URL=https://beesmart.id/app php scripts/checks/smoke_test.php
 *
 * Token HMAC dibuat dari user ADMIN di database lokal, jadi tidak perlu login
 * lewat UI. Pastikan server API sudah berjalan sebelum menjalankan script ini.
 */

require_once dirname(__DIR__, 2) . '/api/db.php';
require_once dirname(__DIR__, 2) . '/api/auth_guard.php';

$baseUrl = rtrim((string)($argv[1] ?? (getenv('BEESMART_BASE_URL') ?: 'http://127.0.0.1:8088')), '/');

$admin = $pdo->query("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$admin) {
    fwrite(STDERR, "Gagal: tidak ada user ADMIN di database untuk membuat token.\n");
    exit(1);
}

$token = issueAuthToken($admin['id'], $admin['role'], $admin['email'] ?? '', (int)($admin['tokenVersion'] ?? 0));
if (!$token) {
    fwrite(STDERR, "Gagal: auth secret belum dikonfigurasi (api/auth_config.php).\n");
    exit(1);
}

/**
 * Endpoint yang diuji. Semua bersifat GET / read-only.
 * Format: 'nama endpoint' => ['file.php', ['param' => 'nilai']].
 */
// Hanya endpoint yang memang melayani GET baca data. Endpoint seperti
// products.php / members.php / orders.php bersifat write-only di codebase ini
// (datanya dibaca lewat get_app_data.php), jadi tidak diuji di sini.
$endpoints = [
    'get_app_data'      => ['get_app_data.php', []],
    'get_sales_summary' => ['get_sales_summary.php', []],
    'get_transactions'  => ['get_transactions.php', []],
    'get_export_data'   => ['get_export_data.php', []],
    'get_messages'      => ['get_messages.php', []],
    'shipping_rates'    => ['shipping_rates.php', []],
    'settings'          => ['settings.php', []],
    'users'             => ['users.php', []],
];

function requestApi(string $url, string $token): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ],
    ]);

    $body = curl_exec($ch);
    $error = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [$httpCode, $body, $error];
}

echo "BeeSmart API smoke test — $baseUrl\n";
echo str_repeat('-', 68) . "\n";

$failures = 0;
foreach ($endpoints as $name => [$file, $params]) {
    $url = $baseUrl . '/api/' . $file;
    if ($params) {
        $url .= '?' . http_build_query($params);
    }

    [$code, $body, $error] = requestApi($url, $token);

    if ($error !== '') {
        printf("FAIL  %-20s HTTP %-4s %s\n", $name, $code ?: '-', $error);
        $failures++;
        continue;
    }

    $data = json_decode((string)$body, true);
    $apiStatus = is_array($data) ? ($data['status'] ?? 'ok') : 'invalid-json';

    if ($code === 200 && $apiStatus !== 'error' && $apiStatus !== 'invalid-json') {
        printf("OK    %-20s HTTP %d\n", $name, $code);
    } else {
        $message = is_array($data) ? (string)($data['message'] ?? $apiStatus) : 'JSON tidak valid';
        $preview = trim(preg_replace('/\s+/', ' ', (string)$body) ?: '(body kosong)');
        printf("FAIL  %-20s HTTP %-4s %s | %s\n", $name, $code ?: '-', $message, substr($preview, 0, 120));
        $failures++;
    }
}

echo str_repeat('-', 68) . "\n";
if ($failures) {
    fwrite(STDERR, "$failures endpoint gagal.\n");
    exit(1);
}

echo "Semua " . count($endpoints) . " endpoint merespons dengan baik.\n";
