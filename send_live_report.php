<?php
// Jika parameter berupa keyword (seperti 'weekly' atau 'harian'), atur tanggal otomatis
$arg1 = $argv[1] ?? 'harian';
if ($arg1 === 'weekly' || $arg1 === 'mingguan') {
    // Rekap laporan hari Senin sampai Jumat minggu berjalan (atau 4-5 hari kebelakang)
    $startDate = date('Y-m-d', strtotime('monday this week'));
    $endDate = date('Y-m-d');
    $reportType = 'MINGGUAN';
} elseif ($arg1 === 'harian' || $arg1 === 'daily') {
    $startDate = date('Y-m-d', strtotime('-1 day'));
    $endDate = date('Y-m-d');
    $reportType = 'HARIAN';
} else {
    $startDate = $argv[1] ?? date('Y-m-d', strtotime('-1 day'));
    $endDate = $argv[2] ?? date('Y-m-d');
    $reportType = $argv[3] ?? 'HARIAN';
}

$output = shell_exec("php live_report_cli.php $startDate $endDate");
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
