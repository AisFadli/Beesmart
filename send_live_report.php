<?php
$startDate = $argv[1] ?? date('Y-m-d', strtotime('-1 day'));
$endDate = $argv[2] ?? date('Y-m-d');
$reportType = $argv[3] ?? 'HARIAN';

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
