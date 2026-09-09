
<?php
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    try {
        $pdo->beginTransaction();

        $paymentStatus = $data['paymentStatus'] ?? 'PAID';
        $transactionType = $data['transactionType'] ?? 'NORMAL';

        // 1. Insert ke tabel transactions
        $stmt = $pdo->prepare("INSERT INTO transactions (id, timestamp, total, paymentMethod, paymentStatus, staffId, memberId, customerName, notes, deliveryType, shippingCost, paymentProof, latitude, longitude, transactionType, status, orderStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)");
        $stmt->execute([
            $data['id'], $data['timestamp'], $data['total'], $data['paymentMethod'], $paymentStatus,
            $data['staffId'], $data['memberId'] ?? null, $data['customerName'] ?? null, $data['notes'] ?? null,
            $data['deliveryType'] ?? 'PICKUP', $data['shippingCost'] ?? 0, $data['paymentProof'] ?? null,
            $data['latitude'] ?? null, $data['longitude'] ?? null, $transactionType,
            $data['orderStatus'] ?? (isset($data['memberId']) ? 'PENDING' : null)
        ]);

        // 2. Logika Deposit: Jika bayar pakai deposit, potong saldo member
        if ($data['paymentMethod'] === 'DEPOSIT' && !empty($data['memberId'])) {
            // Potong saldo
            $stmtDeduct = $pdo->prepare("UPDATE members SET depositBalance = depositBalance - ? WHERE id = ?");
            $stmtDeduct->execute([(float)$data['total'], $data['memberId']]);
            
            // Catat log penggunaan
            $logStmt = $pdo->prepare("INSERT INTO member_logs (memberId, type, amount, timestamp, notes) VALUES (?, 'USAGE', ?, NOW(), ?)");
            $logStmt->execute([$data['memberId'], (float)$data['total'], "Pembayaran Transaksi #" . $data['id']]);
        }

        // 3. Insert items dan Update Stok
        foreach ($data['items'] as $item) {
            $stmtItem = $pdo->prepare("INSERT INTO transaction_items (transactionId, productId, name, sku, category, quantity, price, costPrice, originalPrice, discountValue, discountType, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $normalizedItemCategory = strtoupper(trim($item['category'] ?? 'LAINNYA'));
            $stmtItem->execute([
                $data['id'], $item['productId'], $item['name'], $item['sku'] ?? '', $normalizedItemCategory,
                $item['quantity'], $item['price'], $item['costPrice'],
                $item['originalPrice'] ?? $item['price'],
                $item['discountValue'] ?? 0,
                $item['discountType'] ?? 'FIXED', 
                $item['subtotal']
            ]);

            // Kurangi stok produk (Hanya jika bukan INDENT atau jika stok mencukupi)
            // Namun user ingin tetap bisa input meski kosong.
            // Kita tetap kurangi stok, sehingga stok bisa menjadi negatif (menandakan backlog).
            $stmtStock = $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
            $stmtStock->execute([$item['quantity'], $item['productId']]);
        }

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Transaksi berhasil disimpan"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    
    try {
        $pdo->beginTransaction();

        // Fetch before data for log
        $stmtTx = $pdo->prepare("SELECT * FROM transactions WHERE id = ?");
        $stmtTx->execute([$id]);
        $before = $stmtTx->fetch();

        if ($before) {
            // Restore saldo jika pembayaran via deposit
            if ($before['paymentMethod'] === 'DEPOSIT' && !empty($before['memberId'])) {
                $stmtRestoreBal = $pdo->prepare("UPDATE members SET depositBalance = depositBalance + ? WHERE id = ?");
                $stmtRestoreBal->execute([(float)$before['total'], $before['memberId']]);
                
                // Opsional: Hapus log usage terkait
                $stmtDelLog = $pdo->prepare("DELETE FROM member_logs WHERE memberId = ? AND type = 'USAGE' AND notes LIKE ?");
                $stmtDelLog->execute([$before['memberId'], "%" . $id . "%"]);
            }

            // Ambil item transaksi untuk mengembalikan stok
            $stmtItems = $pdo->prepare("SELECT productId, quantity FROM transaction_items WHERE transactionId = ?");
            $stmtItems->execute([$id]);
            $items = $stmtItems->fetchAll();

            foreach ($items as $item) {
                $stmtRestore = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
                $stmtRestore->execute([$item['quantity'], $item['productId']]);
            }

            // Perform SOFT DELETE instead of physical delete
            $stmtDelTx = $pdo->prepare("UPDATE transactions SET status = 'INACTIVE' WHERE id = ?");
            $stmtDelTx->execute([$id]);

            logActivity($pdo, $_GET['staffName'] ?? 'System', 'Transactions', 'SOFT_DELETE_TRANSACTION', $id, $before, ['status' => 'INACTIVE']);
        }

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Transaksi dibatalkan & stok dikembalikan"]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

if ($method === 'PUT') {
    $json = file_get_contents("php://input");
    $data = json_decode($json, true);
    
    if (!$data || !isset($data['id'])) {
        sendResponse(["status" => "error", "message" => "ID Transaksi tidak valid."], 400);
    }

    try {
        $pdo->beginTransaction();

        $stmtOld = $pdo->prepare("SELECT * FROM transactions WHERE id = ?");
        $stmtOld->execute([$data['id']]);
        $before = $stmtOld->fetch();

        if (!$before) throw new Error("Transaksi tidak ditemukan.");

        // Update detail transaksi (Status Bayar, Metode Bayar, Timestamp Pelunasan, Catatan, Tanggal Terima, dan Status Pesanan)
        $stmt = $pdo->prepare("UPDATE transactions SET 
            paymentStatus = ?, 
            paymentMethod = ?, 
            timestamp = ?, 
            notes = ?,
            receivedAt = ?,
            orderStatus = ?
            WHERE id = ?");
            
        $stmt->execute([
            $data['paymentStatus'] ?? 'PAID',
            $data['paymentMethod'] ?? 'CASH',
            isset($data['timestamp']) ? str_replace('T', ' ', $data['timestamp']) : ($before['timestamp'] ?? date('Y-m-d H:i:s')),
            $data['notes'] ?? $before['notes'], 
            $data['receivedAt'] ?? $before['receivedAt'],
            $data['orderStatus'] ?? $before['orderStatus'],
            $data['id']
        ]);

        logActivity($pdo, $data['staffId'] ?? 'System', 'Transactions', 'UPDATE_TRANSACTION', $data['id'], $before, $data);

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Transaksi berhasil diperbarui."]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendResponse(["status" => "error", "message" => "Database Error: " . $e->getMessage()], 500);
    }
}
