<?php
require_once __DIR__ . '/api/db.php';
require_once __DIR__ . '/api/auth_guard.php';

// Generate valid live token on the fly using local auth secret (matches beesmart.id)
$stmtAdmin = $pdo->query("SELECT id, role, email FROM users WHERE role = 'ADMIN' LIMIT 1");
$admin = $stmtAdmin->fetch();
$token = $admin ? issueAuthToken($admin['id'], $admin['role'], $admin['email'], 0) : '';

$startDate = $argv[1] ?? date('Y-m-d', strtotime('-1 day'));
$endDate = $argv[2] ?? date('Y-m-d');

$url = "https://beesmart.id/app/api/get_sales_summary.php?startDate=$startDate&endDate=$endDate";

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $token,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = null;
if ($httpCode === 200) {
    $decoded = json_decode($response, true);
    if (isset($decoded['revenue'])) {
        $data = $decoded;
    }
}

// Fallback ke database lokal jika hosting online belum mengembalikan data valid ATAU jika omzet 0 namun database lokal memiliki transaksi
if (!$data || (float)($data['revenue'] ?? 0) <= 0) {
    require_once __DIR__ . '/api/db.php';
    try {
        $stmt = $pdo->prepare("SELECT SUM(total) as totalRevenue FROM transactions WHERE paymentStatus = 'PAID' AND COALESCE(status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND timestamp >= ? AND timestamp < DATE_ADD(?, INTERVAL 1 DAY)");
        $stmt->execute([$startDate, $endDate]);
        $revenue = (float)$stmt->fetch()['totalRevenue'];

        $stmt = $pdo->prepare("SELECT ti.category, SUM(ti.subtotal) as total, SUM(ti.quantity * ti.costPrice) as cost
                               FROM transaction_items ti 
                               JOIN transactions t ON ti.transactionId = t.id 
                               WHERE t.paymentStatus = 'PAID' AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE') AND t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY)
                               GROUP BY ti.category 
                               ORDER BY total DESC");
        $stmt->execute([$startDate, $endDate]);
        $byCategory = $stmt->fetchAll();
        $byPaymentMethod = [];
    } catch (Exception $e) {
        echo "Gagal mengambil data dari hosting online maupun lokal: " . $e->getMessage() . "\n";
        exit(1);
    }
} else {
    $revenue = (float)($data['revenue'] ?? 0);
    $byCategory = $data['byCategory'] ?? [];
    $byPaymentMethod = $data['byPaymentMethod'] ?? [];
}

function getParentCategory($cat) {
    $c = strtoupper(trim($cat));
    if (strpos($c, 'TITIPAN') !== false || strpos($c, 'AURA') !== false || strpos($c, 'WIWIK') !== false || strpos($c, 'ERMA') !== false || strpos($c, 'UBAY') !== false || strpos($c, 'TEGUH') !== false || strpos($c, 'NITA') !== false) {
        return 'Layanan Titipan Penjualan';
    }
    if (strpos($c, 'SERAGAM') !== false || strpos($c, 'ATRIBUT') !== false) {
        return 'Layanan Seragam';
    }
    if (strpos($c, 'OPPA') !== false || strpos($c, 'THAI') !== false || strpos($c, 'FRANCHISE') !== false) {
        return 'Layanan Franchise';
    }
    if (strpos($c, 'KATERING') !== false || strpos($c, 'NASI') !== false || strpos($c, 'SNACK') !== false || strpos($c, 'PRASMANAN') !== false || strpos($c, 'JUMBER') !== false) {
        return 'Layanan Katering';
    }
    if (strpos($c, 'BUKU') !== false || strpos($c, 'ATK') !== false || strpos($c, 'TULIS') !== false) {
        return 'Buku & Alat Tulis';
    }
    if (strpos($c, 'KANTIN') !== false || strpos($c, 'MAKANAN') !== false || strpos($c, 'MINUMAN') !== false || strpos($c, 'AISQU') !== false) {
        return 'Kantin & Jajanan';
    }
    return 'Layanan & Jasa Lainnya';
}

$parentSummary = [];
foreach ($byCategory as $row) {
    $subCat = strtoupper(trim($row['category'] ?? 'LAINNYA'));
    $total = (float)($row['total'] ?? 0);
    $parent = getParentCategory($subCat);
    
    if (!isset($parentSummary[$parent])) {
        $parentSummary[$parent] = [
            'total' => 0,
            'subcats' => []
        ];
    }
    $parentSummary[$parent]['total'] += $total;
    if (!isset($parentSummary[$parent]['subcats'][$subCat])) {
        $parentSummary[$parent]['subcats'][$subCat] = 0;
    }
    $parentSummary[$parent]['subcats'][$subCat] += $total;
}

uasort($parentSummary, function($a, $b) {
    return $b['total'] <=> $a['total'];
});

echo "📊 *LAPORAN PENJUALAN BEESMART* ($startDate s/d $endDate)\n\n";
echo "💰 *Total Omzet (PAID)*: Rp " . number_format($revenue, 0, ',', '.') . "\n\n";
echo "📈 *Rekap Berdasarkan Induk Kategori*:\n";

foreach ($parentSummary as $parent => $pData) {
    $pct = $revenue > 0 ? round(($pData['total'] / $revenue) * 100, 1) : 0;
    echo "• *$parent* — Rp " . number_format($pData['total'], 0, ',', '.') . " ($pct%)\n";
    
    arsort($pData['subcats']);
    $subStrs = [];
    foreach ($pData['subcats'] as $sc => $st) {
        $subStrs[] = "$sc (Rp " . number_format($st, 0, ',', '.') . ")";
    }
    echo "  Sub: " . implode(", ", $subStrs) . "\n";
}

if (!empty($byPaymentMethod)) {
    echo "\n💳 *Metode Pembayaran*:\n";
    foreach ($byPaymentMethod as $pm) {
        echo "• " . ($pm['paymentMethod'] ?? 'CASH') . " — Rp " . number_format($pm['total'], 0, ',', '.') . "\n";
    }
}
