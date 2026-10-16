<?php
$dbConfig = require __DIR__ . '/api/db_config.php';
$pdo = new PDO("mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['dbname']}", $dbConfig['username'], $dbConfig['password']);

$stmt = $pdo->query("SELECT timestamp, total FROM transactions ORDER BY timestamp DESC LIMIT 20");
foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    echo "Timestamp: {$row['timestamp']} | Total: {$row['total']}\n";
}
