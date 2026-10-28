<?php
// Jika parameter berupa keyword (seperti 'weekly' atau 'harian'), atur tanggal otomatis
$arg1 = $argv[1] ?? 'harian';
if ($arg1 === 'weekly' || $arg1 === 'mingguan') {
    // Rekap laporan hari Senin s/d Jumat minggu berjalan
    $startDate = date('Y-m-d', strtotime('monday this week'));
    $endDate = date('Y-m-d', strtotime('friday this week'));
    $reportType = 'MINGGUAN';
} elseif ($arg1 === 'harian' || $arg1 === 'daily') {
    // Rekap laporan harian tepat 1 hari kemarin (startDate = endDate)
    $targetDate = date('Y-m-d', strtotime('-1 day'));
    $startDate = $targetDate;
    $endDate = $targetDate;
    $reportType = 'HARIAN';
} else {
    $startDate = $argv[1] ?? date('Y-m-d', strtotime('-1 day'));
    $endDate = $argv[2] ?? $startDate;
    $reportType = $argv[3] ?? 'HARIAN';
}

$output = shell_exec("php " . __DIR__ . "/live_report_cli.php $startDate $endDate");
$message = "📊 *OTOMATIS LAPORAN {$reportType} BEESMART*\n\n" . $output;

$url = 'http://localhost:3005/api/whatsapp/send';
$payload = json_encode(['to' => '120363421424271082@g.us', 'message' => $message]);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
$res = curl_exec($ch);
curl_close($ch);

echo $res;
