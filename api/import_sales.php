<?php
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

if ($method !== 'POST') {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}

try {
    $items = $data['items'] ?? [];
    $updateStock = filter_var($data['updateStock'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $staffId = $data['staffId'] ?? 'System Import';

    if (empty($items)) {
        sendResponse(["status" => "error", "message" => "No items to import"], 400);
    }

    $pdo->beginTransaction();

    $results = [];
    $successCount = 0;
    $errorCount = 0;

    // Group items by Transaction ID if provided, otherwise treat each as separate
    $transactions = [];
    foreach ($items as $item) {
        $ref = !empty($item['Transaction_ID']) ? $item['Transaction_ID'] : 'IMP-' . uniqid();
        if (!isset($transactions[$ref])) {
            $transactions[$ref] = [
                'date' => $item['Date'] ?? date('Y-m-d H:i:s'),
                'paymentMethod' => strtoupper($item['Payment_Method'] ?? 'CASH'),
                'customerName' => $item['Customer_Name'] ?? 'UMUM',
                'notes' => $item['Notes'] ?? 'Imported Historical Data',
                'items' => []
            ];
        }
        $transactions[$ref]['items'][] = $item;
    }

    foreach ($transactions as $ref => $txData) {
        $total = 0;
        $txItems = [];
        $txError = false;

        foreach ($txData['items'] as $item) {
            $sku = $item['SKU'] ?? '';
            $qty = (float)($item['Quantity'] ?? 0);
            $price = (float)($item['Selling_Price'] ?? 0);

            if (empty($sku) || $qty <= 0) {
                $results[] = ["ref" => $ref, "status" => "error", "message" => "Invalid SKU or Quantity"];
                $txError = true;
                break;
            }

            // Find product
            $stmt = $pdo->prepare("SELECT id, name, category, costPrice, stock FROM products WHERE sku = ?");
            $stmt->execute([$sku]);
            $product = $stmt->fetch();

            if (!$product) {
                $results[] = ["ref" => $ref, "status" => "error", "message" => "Product with SKU $sku not found"];
                $txError = true;
                break;
            }

            $subtotal = $qty * $price;
            $total += $subtotal;

            $txItems[] = [
                'productId' => $product['id'],
                'name' => $product['name'],
                'category' => $product['category'],
                'quantity' => $qty,
                'price' => $price,
                'costPrice' => (float)$product['costPrice'],
                'subtotal' => $subtotal
            ];

            // Update stock if requested
            if ($updateStock) {
                $stmt = $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
                $stmt->execute([$qty, $product['id']]);
            }
        }

        if ($txError) {
            $errorCount++;
            continue;
        }

        // Insert Transaction
        $txId = $ref;
        // Check if ID exists to avoid double input
        $stmt = $pdo->prepare("SELECT id FROM transactions WHERE id = ?");
        $stmt->execute([$txId]);
        if ($stmt->fetch()) {
            $results[] = ["ref" => $ref, "status" => "error", "message" => "Transaction ID $ref already exists (Double Input)"];
            $errorCount++;
            continue;
        }

        $stmt = $pdo->prepare("INSERT INTO transactions (id, timestamp, total, paymentMethod, paymentStatus, staffId, customerName, notes, status) VALUES (?, ?, ?, ?, 'PAID', ?, ?, ?, 'NORMAL')");
        $stmt->execute([$txId, $txData['date'], $total, $txData['paymentMethod'], $staffId, $txData['customerName'], $txData['notes']]);

        // Insert Items
        $stmt = $pdo->prepare("INSERT INTO transaction_items (transactionId, productId, name, category, quantity, price, costPrice, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($txItems as $ti) {
            $stmt->execute([$txId, $ti['productId'], $ti['name'], $ti['category'], $ti['quantity'], $ti['price'], $ti['costPrice'], $ti['subtotal']]);
        }

        $successCount++;
    }

    $pdo->commit();
    sendResponse([
        "status" => "success",
        "message" => "Import completed: $successCount success, $errorCount errors",
        "details" => $results
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
