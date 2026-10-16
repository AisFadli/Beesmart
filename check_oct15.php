<?php
$dbConfig = require __DIR__ . '/api/db_config.php';
$pdo = new PDO("mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['dbname']}", $dbConfig['username'], $dbConfig['password']);

$stmt = $pdo->prepare("SELECT * FROM transactions WHERE DATE(timestamp) = '2026-10-15'");
$stmt->execute();
$txs = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Transactions on 2026-10-15 (timestamp): " . count($txs) . "\n";
$total = 0;
foreach($txs as $t) {
    $total += (float)$t['total'];
    echo "- ID: {$t['id']}, Time: {$t['timestamp']}, Total: {$t['total']}\n";
}

$stmt2 = $pdo->prepare("
    SELECT t.id, t.timestamp, ti.name, ti.category, ti.quantity, ti.subtotal
    FROM transactions t
    JOIN transaction_items ti ON t.id = ti.transactionId
    WHERE DATE(t.timestamp) = '2026-10-15'
");
$stmt2->execute();
$items = $stmt2->fetchAll(PDO::FETCH_ASSOC);
echo "Total items: " . count($items) . "\n";
foreach($items as $i) {
    echo "  * {$i['name']} ({$i['category']}) x {$i['quantity']} = Rp {$i['subtotal']}\n";
}
