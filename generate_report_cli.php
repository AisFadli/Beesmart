<?php
$dbConfig = require __DIR__ . '/api/db_config.php';
$host = $dbConfig['host'] ?? '127.0.0.1';
$port = $dbConfig['port'] ?? '3307';
$dbname = $dbConfig['dbname'] ?? 'beesmart_dev';
$username = $dbConfig['username'] ?? 'root';
$password = $dbConfig['password'] ?? '';

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4", $username, $password, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
]);

$startDate = $argv[1] ?? date('Y-m-d', strtotime('-1 day'));
$endDate = $argv[2] ?? date('Y-m-d');

$stmt = $pdo->prepare("
    SELECT t.id as transaction_id, t.timestamp, ti.name as item_name, ti.category, ti.quantity, ti.subtotal
    FROM transactions t
    JOIN transaction_items ti ON t.id = ti.transactionId
    WHERE t.timestamp >= ? AND t.timestamp < DATE_ADD(?, INTERVAL 1 DAY)
    AND COALESCE(t.status, 'ACTIVE') NOT IN ('CANCELLED', 'INACTIVE')
");
$stmt->execute([$startDate, $endDate]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

function getParentCategory($cat) {
    $c = strtoupper(trim($cat));
    if (strpos($c, 'TITIPAN') !== false || strpos($c, 'AURA') !== false || strpos($c, 'WIWIK') !== false || strpos($c, 'ERMA') !== false || strpos($c, 'UBAY') !== false || strpos($c, 'TEGUH') !== false) {
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

$totalOmzet = 0;
$txIds = [];
$parentSummary = [];

foreach ($rows as $r) {
    $totalOmzet += (float)$r['subtotal'];
    $txIds[$r['transaction_id']] = true;

    $parent = getParentCategory($r['category']);
    $subCat = strtoupper(trim($r['category']));
    $itemName = trim($r['item_name']);
    $qty = (int)$r['quantity'];
    $subtotal = (float)$r['subtotal'];

    if (!isset($parentSummary[$parent])) {
        $parentSummary[$parent] = [
            'total' => 0,
            'qty' => 0,
            'subcats' => [],
            'items' => []
        ];
    }
    $parentSummary[$parent]['total'] += $subtotal;
    $parentSummary[$parent]['qty'] += $qty;

    if (!isset($parentSummary[$parent]['subcats'][$subCat])) {
        $parentSummary[$parent]['subcats'][$subCat] = 0;
    }
    $parentSummary[$parent]['subcats'][$subCat] += $subtotal;

    if (!isset($parentSummary[$parent]['items'][$itemName])) {
        $parentSummary[$parent]['items'][$itemName] = 0;
    }
    $parentSummary[$parent]['items'][$itemName] += $qty;
}

uasort($parentSummary, function($a, $b) {
    return $b['total'] <=> $a['total'];
});

$totalTx = count($txIds);
echo "📊 UJI COBA LAPORAN BEESMART ($startDate s/d $endDate)\n";
echo "💰 Total Omzet: Rp " . number_format($totalOmzet, 0, ',', '.') . " ($totalTx Transaksi)\n\n";
echo "📈 Rekap Berdasarkan Induk Kategori:\n";

foreach ($parentSummary as $parent => $data) {
    $pct = $totalOmzet > 0 ? round(($data['total'] / $totalOmzet) * 100, 1) : 0;
    echo "• $parent — Rp " . number_format($data['total'], 0, ',', '.') . " ($pct% dari total) | {$data['qty']} item\n";

    arsort($data['subcats']);
    $subStrs = [];
    foreach ($data['subcats'] as $sc => $st) {
        $subStrs[] = "$sc (Rp " . number_format($st, 0, ',', '.') . ")";
    }
    echo "  Sub: " . implode(", ", $subStrs) . "\n";

    arsort($data['items']);
    $topItems = array_slice($data['items'], 0, 3, true);
    $topStrs = [];
    foreach ($topItems as $it => $iq) {
        $topStrs[] = "$it ($iq)";
    }
    echo "  Top: " . implode(", ", $topStrs) . "\n";
}
