<?php
$arg1 = $argv[1] ?? 'harian';
if ($arg1 === 'weekly' || $arg1 === 'mingguan') {
    $startDate = date('Y-m-d', strtotime('monday this week'));
    $endDate = date('Y-m-d', strtotime('friday this week'));
    $reportType = 'MINGGUAN';
} elseif ($arg1 === 'harian' || $arg1 === 'daily') {
    // Default ambil kemarin jika cron job kirim harian pagi hari
    $targetDate = $argv[2] ?? date('Y-m-d', strtotime('-1 day'));
    $startDate = $targetDate;
    $endDate = $targetDate;
    $reportType = 'HARIAN';
} else {
    $startDate = $argv[1] ?? date('Y-m-d', strtotime('-1 day'));
    $endDate = $argv[2] ?? $startDate;
    $reportType = 'HARIAN';
}

// Selalu kirim kedua tanggal ke CLI (termasuk mode mingguan) dan enkapsulasi argumen.
$targetDateArg = escapeshellarg($startDate) . ' ' . escapeshellarg($endDate);
$command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/live_report_cli.php') . ' ' . $targetDateArg;
$output = shell_exec($command);
$message = "📊 *OTOMATIS LAPORAN {$reportType} BEESMART*\n\n" . $output;

$url = 'http://localhost:3005/api/whatsapp/send';
$payload = json_encode(['to' => '120363421424271082@g.us', 'message' => $message]);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
$res = curl_exec($ch);
$err = curl_error($ch);
curl_close($ch);

if ($err) {
    echo json_encode(["status" => "error", "message" => $err]);
} else {
    echo $res;
}
