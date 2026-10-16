
<?php
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
$auth = currentAuth();
$authRole = strtoupper($auth['role'] ?? '');
$canManageTransactions = in_array($authRole, ['ADMIN', 'STAFF'], true);

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!is_array($data) || !isset($data['items']) || !is_array($data['items']) || count($data['items']) < 1 || count($data['items']) > 100) {
        sendResponse(["status" => "error", "message" => "Item transaksi tidak valid."], 400);
    }

    $internalRoles = ['ADMIN', 'STAFF', 'USER', 'TENANT', 'VISITOR'];
    $isInternal = in_array($authRole, $internalRoles, true);
    if (!in_array($authRole, ['ADMIN', 'STAFF', 'USER', 'TENANT', 'MEMBER'], true)) {
        sendResponse(["status" => "error", "message" => "Role Anda tidak diizinkan membuat transaksi."], 403);
    }
    $paymentMethod = strtoupper((string)($data['paymentMethod'] ?? ''));
    if (!in_array($paymentMethod, ['CASH', 'DEBIT', 'QRIS', 'DEPOSIT', 'TRANSFER', 'UNPAID'], true)) {
        sendResponse(["status" => "error", "message" => "Metode pembayaran tidak valid."], 400);
    }

    $productIds = [];
    foreach ($data['items'] as $item) {
        if (!is_array($item) || empty($item['productId']) || filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT) === false || (int)$item['quantity'] < 1) {
            sendResponse(["status" => "error", "message" => "Produk atau jumlah item tidak valid."], 400);
        }
        $productIds[] = (string)$item['productId'];
    }
    if (count(array_unique($productIds)) !== count($productIds)) {
        sendResponse(["status" => "error", "message" => "Produk duplikat dalam transaksi."], 400);
    }

    $transactionId = (string)($data['id'] ?? '');
    if ($transactionId === '' || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', $transactionId)) {
        sendResponse(["status" => "error", "message" => "ID transaksi tidak valid."], 400);
    }

    $rawTimestamp = str_replace('T', ' ', (string)($data['timestamp'] ?? ''));
    $timestampValue = strtotime($rawTimestamp);
    if ($timestampValue === false) {
        sendResponse(["status" => "error", "message" => "Tanggal transaksi tidak valid."], 400);
    }
    $timestamp = date('Y-m-d H:i:s', $timestampValue);
    $deliveryType = strtoupper((string)($data['deliveryType'] ?? 'PICKUP'));
    if (!in_array($deliveryType, ['PICKUP', 'DELIVERY'], true)) {
        sendResponse(["status" => "error", "message" => "Jenis pengiriman tidak valid."], 400);
    }

    try {
        $pdo->beginTransaction();

        $productPlaceholders = implode(',', array_fill(0, count($productIds), '?'));
        $stmtProducts = $pdo->prepare("SELECT id, sku, name, category, price, costPrice, stock, discountValue, discountType, discountStart, discountEnd, status, indentStatus FROM products WHERE id IN ($productPlaceholders) FOR UPDATE");
        $stmtProducts->execute($productIds);
        $products = [];
        foreach ($stmtProducts->fetchAll() as $product) {
            if ($product['status'] === 'INACTIVE') continue;
            $products[$product['id']] = $product;
        }
        if (count($products) !== count($productIds)) {
            throw new Exception("Salah satu produk tidak tersedia.");
        }

        if ($authRole === 'TENANT') {
            $stmtTenant = $pdo->prepare("SELECT tenantCategories FROM users WHERE id = ? AND (status = 'ACTIVE' OR status IS NULL OR status = '') LIMIT 1");
            $stmtTenant->execute([$auth['uid'] ?? '']);
            $tenantRow = $stmtTenant->fetch();
            $tenantCategories = $tenantRow ? (json_decode($tenantRow['tenantCategories'] ?? '[]', true) ?: []) : [];
            $tenantCategories = array_map(function($category) { return strtoupper(trim((string)$category)); }, $tenantCategories);
            foreach ($products as $product) {
                if (!in_array(strtoupper(trim((string)$product['category'])), $tenantCategories, true)) {
                    throw new Exception("Produk berada di luar kategori yang dikelola tenant.");
                }
            }
        }

        $memberId = $isInternal ? ($data['memberId'] ?? null) : ($auth['uid'] ?? null);
        if (!$isInternal) {
            $data['staffId'] = $auth['uid'] ?? 'MEMBER';
        }
        $member = null;
        if (!empty($memberId)) {
            $normalizedMemberId = preg_replace('/^(USER-|USR-)/i', '', trim((string)$memberId));
            $stmtMember = $pdo->prepare("SELECT id, name, status, depositBalance FROM members WHERE id IN (?, ?) FOR UPDATE");
            $stmtMember->execute([$memberId, $normalizedMemberId]);
            $member = $stmtMember->fetch();
            if (!$member || $member['status'] === 'SUSPENDED') {
                throw new Exception("Member tidak ditemukan atau sedang ditangguhkan.");
            }
            $memberId = $member['id'];
        }
        if ($paymentMethod === 'DEPOSIT' && !$member) {
            throw new Exception("Pembayaran deposit memerlukan member yang valid.");
        }

        $shippingCost = 0.0;
        $latitude = null;
        $longitude = null;
        if ($deliveryType === 'DELIVERY') {
            if (!is_numeric($data['latitude'] ?? null) || !is_numeric($data['longitude'] ?? null)) {
                throw new Exception("Lokasi pengiriman tidak valid.");
            }
            $latitude = (float)$data['latitude'];
            $longitude = (float)$data['longitude'];
            if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
                throw new Exception("Lokasi pengiriman tidak valid.");
            }

            $settingsStmt = $pdo->prepare("SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('latitude', 'longitude', 'store_location')");
            $settingsStmt->execute();
            $storeLocation = [];
            foreach ($settingsStmt->fetchAll() as $setting) {
                $storeLocation[$setting['setting_key']] = json_decode($setting['setting_value'], true) ?? $setting['setting_value'];
            }
            $storeLatitude = $storeLocation['latitude'] ?? ($storeLocation['store_location']['lat'] ?? null);
            $storeLongitude = $storeLocation['longitude'] ?? ($storeLocation['store_location']['lng'] ?? null);
            if (!is_numeric($storeLatitude) || !is_numeric($storeLongitude)) {
                throw new Exception("Lokasi toko belum dikonfigurasi.");
            }

            $latDelta = deg2rad($latitude - (float)$storeLatitude);
            $lonDelta = deg2rad($longitude - (float)$storeLongitude);
            $a = sin($latDelta / 2) ** 2 + cos(deg2rad((float)$storeLatitude)) * cos(deg2rad($latitude)) * sin($lonDelta / 2) ** 2;
            $distance = 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
            $rateStmt = $pdo->prepare("SELECT rate FROM shipping_rates WHERE status = 'ACTIVE' AND minDistance <= ? AND maxDistance >= ? ORDER BY minDistance ASC LIMIT 1");
            $rateStmt->execute([$distance, $distance]);
            $shippingRate = $rateStmt->fetchColumn();
            if ($shippingRate === false) {
                throw new Exception("Lokasi berada di luar jangkauan pengiriman.");
            }
            $shippingCost = (float)$shippingRate;
        }

        $now = time();
        $hasIndent = false;
        $computedTotal = 0.0;
        $normalizedItems = [];
        foreach ($data['items'] as $item) {
            $product = $products[(string)$item['productId']];
            $quantity = (int)$item['quantity'];
            if ($authRole === 'MEMBER' && $quantity > (int)$product['stock'] && strtoupper((string)($product['indentStatus'] ?? 'INACTIVE')) !== 'ACTIVE') {
                $message = (int)$product['stock'] <= 0
                    ? "Stok saat ini tidak tersedia, silahkan menghubungi admin untuk pemesanan lebih lanjut."
                    : "Stok produk {$product['name']} tidak mencukupi. Silahkan perbarui keranjang.";
                throw new Exception($message, 409);
            }
            if ($quantity > (int)$product['stock']) $hasIndent = true;

            $originalPrice = (float)$product['price'];
            $discountValue = (float)$product['discountValue'];
            $discountType = strtoupper((string)($product['discountType'] ?: 'FIXED'));
            $discountActive = $discountValue > 0;
            if (!empty($product['discountStart']) && strtotime($product['discountStart']) > $now) $discountActive = false;
            if (!empty($product['discountEnd'])) {
                $discountEnd = strtotime($product['discountEnd']);
                if (strlen((string)$product['discountEnd']) <= 10) $discountEnd = strtotime($product['discountEnd'] . ' 23:59:59');
                if ($discountEnd !== false && $discountEnd < $now) $discountActive = false;
            }
            $price = $originalPrice;
            if ($discountActive) {
                $price = in_array($discountType, ['PERCENT', 'PERCENTAGE'], true)
                    ? $originalPrice * (1 - $discountValue / 100)
                    : $originalPrice - $discountValue;
            }
            $price = round(max(0, $price), 2);
            $subtotal = round($quantity * $price, 2);
            $computedTotal += $subtotal;
            $normalizedItems[] = [
                'product' => $product,
                'quantity' => $quantity,
                'price' => $price,
                'originalPrice' => $originalPrice,
                'discountValue' => $discountActive ? $discountValue : 0,
                'discountType' => $discountType,
                'subtotal' => $subtotal
            ];
        }
        $computedTotal = round($computedTotal + $shippingCost, 2);
        $paymentStatus = !$isInternal
            ? ($paymentMethod === 'DEPOSIT' ? 'PAID' : 'UNPAID')
            : ($paymentMethod === 'UNPAID' ? 'UNPAID' : 'PAID');
        $transactionType = $hasIndent ? 'INDENT' : 'NORMAL';
        $orderStatus = !$isInternal ? 'PENDING' : ($data['orderStatus'] ?? null);
        $staffId = !$isInternal ? ($auth['uid'] ?? 'MEMBER') : ($auth['name'] ?? ($auth['uid'] ?? 'SYSTEM'));
        $customerName = !$isInternal ? ($member['name'] ?? 'MEMBER') : ($data['customerName'] ?? ($member['name'] ?? 'UMUM'));

        // 1. Insert ke tabel transactions
        $stmt = $pdo->prepare("INSERT INTO transactions (id, timestamp, total, paymentMethod, paymentStatus, staffId, memberId, customerName, notes, deliveryType, shippingCost, paymentProof, latitude, longitude, transactionType, status, orderStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)");
        $stmt->execute([
            $transactionId, $timestamp, $computedTotal, $paymentMethod, $paymentStatus,
            $staffId, $memberId, $customerName, $data['notes'] ?? null,
            $deliveryType, $shippingCost, $data['paymentProof'] ?? null,
            $latitude, $longitude, $transactionType, $orderStatus
        ]);

        // 2. Logika Deposit: Jika bayar pakai deposit, potong saldo member
        if ($paymentMethod === 'DEPOSIT' && $member) {
            if ($computedTotal > 0) {
                $stmtDeduct = $pdo->prepare("UPDATE members SET depositBalance = depositBalance - ? WHERE id = ? AND depositBalance >= ?");
                $stmtDeduct->execute([$computedTotal, $memberId, $computedTotal]);
                if ($stmtDeduct->rowCount() !== 1) {
                    throw new Exception("Saldo deposit tidak mencukupi.");
                }
            }
            
            // Catat log penggunaan
            $logStmt = $pdo->prepare("INSERT INTO member_logs (memberId, type, amount, timestamp, notes) VALUES (?, 'USAGE', ?, NOW(), ?)");
            $logStmt->execute([$memberId, $computedTotal, "Pembayaran Transaksi #" . $transactionId]);
        }

        // 3. Insert items dan Update Stok
        foreach ($normalizedItems as $normalizedItem) {
            $item = $normalizedItem['product'];
            $stmtItem = $pdo->prepare("INSERT INTO transaction_items (transactionId, productId, name, sku, category, quantity, price, costPrice, originalPrice, discountValue, discountType, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $normalizedItemCategory = strtoupper(trim($item['category'] ?? 'LAINNYA'));
            $stmtItem->execute([
                $transactionId, $item['id'], $item['name'], $item['sku'] ?? '', $normalizedItemCategory,
                $normalizedItem['quantity'], $normalizedItem['price'], $item['costPrice'],
                $normalizedItem['originalPrice'], $normalizedItem['discountValue'],
                $normalizedItem['discountType'], $normalizedItem['subtotal']
            ]);

            // Kurangi stok produk (Hanya jika bukan INDENT atau jika stok mencukupi)
            // Namun user ingin tetap bisa input meski kosong.
            // Kita tetap kurangi stok, sehingga stok bisa menjadi negatif (menandakan backlog).
            $stmtStock = $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
            $stmtStock->execute([$normalizedItem['quantity'], $item['id']]);
        }

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Transaksi berhasil disimpan"]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => $e->getMessage()], $e->getCode() === 409 ? 409 : 500);
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

        if (!$before) {
            $pdo->rollBack();
            sendResponse(["status" => "error", "message" => "Transaksi tidak ditemukan."], 404);
        }

        // Hanya pemilik (member) atau staff/admin yang boleh membatalkan
        $auth = currentAuth();
        $authRole = strtoupper($auth['role'] ?? '');
        $isOwnerMember = $authRole === 'MEMBER' && ($before['memberId'] ?? '') === ($auth['uid'] ?? '');
        if (!$canManageTransactions && !$isOwnerMember) {
            $pdo->rollBack();
            sendResponse(["status" => "error", "message" => "Akses ditolak."], 403);
        }

        if (!in_array(strtoupper((string)$before['status']), ['INACTIVE', 'CANCELLED'], true)) {
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

            logActivity($pdo, $auth['name'] ?? 'System', 'Transactions', 'SOFT_DELETE_TXN', $id, $before, ['status' => 'INACTIVE']);
        }

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Transaksi dibatalkan & stok dikembalikan"]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

if ($method === 'PUT') {
    if (!$canManageTransactions) {
        sendResponse(["status" => "error", "message" => "Akses ditolak."], 403);
    }

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

        $paymentStatus = strtoupper((string)($data['paymentStatus'] ?? $before['paymentStatus']));
        $paymentMethod = strtoupper((string)($data['paymentMethod'] ?? $before['paymentMethod']));
        $orderStatus = strtoupper((string)($data['orderStatus'] ?? $before['orderStatus']));
        if (!in_array($paymentStatus, ['PAID', 'UNPAID', 'PENDING', 'CANCELLED'], true) ||
            !in_array($paymentMethod, ['CASH', 'DEBIT', 'QRIS', 'DEPOSIT', 'TRANSFER', 'UNPAID'], true) ||
            ($orderStatus !== '' && !in_array($orderStatus, ['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'APPROVED', 'RECEIVED'], true))) {
            sendResponse(["status" => "error", "message" => "Status transaksi tidak valid."], 400);
        }

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
            $paymentStatus,
            $paymentMethod,
            isset($data['timestamp']) ? str_replace('T', ' ', $data['timestamp']) : ($before['timestamp'] ?? date('Y-m-d H:i:s')),
            $data['notes'] ?? $before['notes'], 
            $data['receivedAt'] ?? $before['receivedAt'],
            $orderStatus !== '' ? $orderStatus : null,
            $data['id']
        ]);

        logActivity($pdo, $auth['name'] ?? 'System', 'Transactions', 'UPDATE_TRANSACTION', $data['id'], $before, $data);

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Transaksi berhasil diperbarui."]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendResponse(["status" => "error", "message" => "Database Error: " . $e->getMessage()], 500);
    }
}
