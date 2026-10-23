<?php
// Generate daily report
$dailyOutput = shell_exec('php live_report_cli.php 2026-10-15 2026-10-15');

// Generate weekly report
$weeklyOutput = shell_exec('php live_report_cli.php 2026-10-12 2026-10-16');

$target = '120363421424271082@g.us'; // PENGURUS KARYAWAN KOPERASI 2025-2026 JID

function sendToWhatsApp($to, $message) {
    $url = 'http://localhost:3005/api/whatsapp/send';
    $payload = json_encode(['to' => $to, 'message' => $message]);
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    $res = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return [$httpCode, $res];
}

echo "Mengirim Laporan Harian ke WhatsApp...\n";
list($code1, $res1) = sendToWhatsApp($target, "📊 *OTOMATIS LAPORAN HARIAN BEESMART*\n\n" . $dailyOutput);
echo "Status Harian: $code1 - $res1\n\n";

sleep(2);

echo "Mengirim Laporan Mingguan ke WhatsApp...\n";
list($code2, $res2) = sendToWhatsApp($target, "📊 *OTOMATIS LAPORAN MINGGUAN BEESMART*\n\n" . $weeklyOutput);
echo "Status Mingguan: $code2 - $res2\n";
