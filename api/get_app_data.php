<?php
require_once 'db.php';
require_once 'response.php';
require_once 'app_data_sections.php';

// Endpoint ini hanya mengorkestrasi: konteks role dibangun sekali,
// lalu setiap bagian data dimuat oleh loadAppDataSection().
try {
    $auth = currentAuth() ?? [];
    $context = buildAppDataContext($pdo, $auth);

    $data = $context['preloaded'];
    foreach ($context['tables'] as $table) {
        foreach (loadAppDataSection($pdo, $auth, $context['context'], $table) as $key => $value) {
            $data[$key] = $value;
        }
    }

    // Kontak aman untuk role MEMBER: daftar Admin/Staff/Tenant (tanpa email/password)
    if (strtoupper((string)($auth['role'] ?? '')) === 'MEMBER') {
        try {
            $contactStmt = $pdo->query("SELECT id, name, role FROM users WHERE role IN ('ADMIN', 'STAFF', 'TENANT') AND (status = 'ACTIVE' OR status IS NULL OR status = '') ORDER BY name ASC");
            $data['chat_contacts'] = $contactStmt->fetchAll();
        } catch (Throwable $e) {
            logApiFailure('get_app_data:chat_contacts', $e);
            $data['chat_contacts'] = [];
        }
    }

    sendResponse($data);
} catch (Throwable $e) {
    logApiFailure('get_app_data', $e);
    apiError('Gagal memuat data aplikasi.', 500);
}
