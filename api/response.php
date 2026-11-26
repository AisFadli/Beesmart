<?php
/**
 * Helper respons API & logging kegagalan terpusat.
 * Dipakai bersama sendResponse() di db.php.
 */

if (isset($_SERVER['REQUEST_METHOD']) && ($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(403);
    exit('Forbidden');
}

/**
 * Kirim respons error JSON dan hentikan eksekusi.
 */
function apiError(string $message, int $status = 500, array $extra = []): void
{
    if (function_exists('ob_get_length') && ob_get_length()) {
        ob_clean();
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(array_merge([
        'status' => 'error',
        'message' => $message,
    ], $extra));
    exit;
}

/**
 * Catat kegagalan section endpoint ke logs/api_errors_YYYY-MM.log.
 * Tidak pernah menghentikan request — pemanggil yang menentukan fallback.
 */
function logApiFailure(string $section, Throwable $e): void
{
    $line = date('Y-m-d H:i:s') . ' | ' . $section . ' | ' .
        get_class($e) . ': ' . $e->getMessage() . ' @ ' .
        $e->getFile() . ':' . $e->getLine() . PHP_EOL;

    $logDir = dirname(__DIR__) . '/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0750, true);
    }
    @file_put_contents($logDir . '/api_errors_' . date('Y-m') . '.log', $line, FILE_APPEND | LOCK_EX);

    if (function_exists('error_log')) {
        error_log($line);
    }
}
