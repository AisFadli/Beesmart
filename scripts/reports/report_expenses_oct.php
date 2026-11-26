<?php
require_once dirname(__DIR__, 2) . '/api/db.php';
require_once dirname(__DIR__, 2) . '/api/auth_guard.php';

$stmt = $pdo->query("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1");
$admin = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$admin) die("No admin user found.\n");

$token = issueAuthToken($admin['id'], $admin['role'], $admin['email'], (int)($admin['tokenVersion'] ?? 0));

$ch = curl_init('https://beesmart.id/app/api/expenses.php?start_date=2026-10-01&end_date=2026-10-29');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
$res = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200) {
    echo "Error HTTP $httpCode\n";
    // Fallback: try get_app_data
    $ch2 = curl_init('https://beesmart.id/app/api/get_app_data.php');
    curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch2, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
    $res = curl_exec($ch2);
    curl_close($ch2);
    $data = json_decode($res, true);
    $expenses = $data['expenses'] ?? [];
} else {
    $data = json_decode($res, true);
    $expenses = $data['expenses'] ?? $data['data'] ?? $data ?? [];
    if (isset($expenses['expenses'])) $expenses = $expenses['expenses'];
}

// Filter by date range and exclude cancelled
$filtered = [];
foreach ($expenses as $ex) {
    $date = $ex['date'] ?? '';
    $status = strtoupper(trim($ex['status'] ?? 'NORMAL'));
    if ($date >= '2026-10-01' && $date <= '2026-10-29' && $status !== 'CANCELLED' && $status !== 'VOID') {
        $filtered[] = $ex;
    }
}

// Group by category
$categories = [];
$grandTotal = 0;
foreach ($filtered as $ex) {
    $cat = strtoupper(trim($ex['category'] ?? 'UNCATEGORIZED'));
    $amount = floatval($ex['amount'] ?? 0);
    if (!isset($categories[$cat])) {
        $categories[$cat] = ['total' => 0, 'count' => 0, 'items' => []];
    }
    $categories[$cat]['total'] += $amount;
    $categories[$cat]['count']++;
    $categories[$cat]['items'][] = $ex;
    $grandTotal += $amount;
}

// Sort by total descending
arsort($categories);
uasort($categories, function($a, $b) { return $b['total'] <=> $a['total']; });

echo "=== REKAP PENGELUARAN 1-29 OKT 2026 ===\n";
echo "Total transaksi: " . count($filtered) . "\n";
echo "Grand Total: Rp " . number_format($grandTotal, 0, ',', '.') . "\n\n";

foreach ($categories as $cat => $data) {
    $pct = ($grandTotal > 0) ? round($data['total'] / $grandTotal * 100, 1) : 0;
    echo "📌 $cat — Rp " . number_format($data['total'], 0, ',', '.') . " ({$data['count']} transaksi, {$pct}%)\n";
    foreach ($data['items'] as $item) {
        echo "   • {$item['date']} | {$item['description']} — Rp " . number_format(floatval($item['amount']), 0, ',', '.') . "\n";
    }
    echo "\n";
}
