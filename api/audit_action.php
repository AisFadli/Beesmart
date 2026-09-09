<?php
require_once 'db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}

$data = json_decode(file_get_contents("php://input"), true);
$action = $data['action'] ?? ''; // 'edit' or 'cancel'
$ref = $data['ref'] ?? ''; // e.g., 'TXN-123' or 'ADJ-456' or 'STOK-AWAL'
$productId = $data['productId'] ?? '';

if (!$ref) {
    sendResponse(["status" => "error", "message" => "Reference ID is required."], 400);
}

// Auto-resolve productId for ADJ- if missing
if (!$productId && strpos($ref, 'ADJ-') === 0) {
    $adjId = str_replace('ADJ-', '', $ref);
    $stmtAdj = $pdo->prepare("SELECT productId FROM stock_adjustments WHERE id = ?");
    $stmtAdj->execute([$adjId]);
    $foundAdj = $stmtAdj->fetch();
    if ($foundAdj && !empty($foundAdj['productId'])) {
        $productId = $foundAdj['productId'];
    }
}

if (!$productId && $action !== 'approve_adjustment') {
    sendResponse(["status" => "error", "message" => "Reference ID and Product ID are required."], 400);
}

try {
    $pdo->beginTransaction();

    if ($action === 'cancel') {
        if (strpos($ref, 'ADJ-') === 0) {
            $adjId = str_replace('ADJ-', '', $ref);
            $stmt = $pdo->prepare("SELECT quantity, type, status FROM stock_adjustments WHERE id = ?");
            $stmt->execute([$adjId]);
            $adj = $stmt->fetch();
            
            if ($adj && $adj['status'] !== 'CANCELLED') {
                $isAddition = ($adj['type'] === 'IN' || $adj['type'] === 'RESTOCK' || $adj['type'] === 'RETURN');
                $mutation = $isAddition ? (int)$adj['quantity'] : -(int)$adj['quantity'];
                
                // Hanya revert stok jika statusnya NORMAL atau REVISED (sudah pernah masuk ke stok)
                if ($adj['status'] === 'NORMAL' || $adj['status'] === 'REVISED') {
                    $stmtRevert = $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
                    $stmtRevert->execute([$mutation, $productId]);
                }
                
                $stmtStatus = $pdo->prepare("UPDATE stock_adjustments SET status = 'CANCELLED' WHERE id = ?");
                $stmtStatus->execute([$adjId]);
            }
        } else if (strpos($ref, 'TXN-') === 0 || strpos($ref, 'TX-') === 0) {
            $stmt = $pdo->prepare("SELECT status FROM transactions WHERE id = ?");
            $stmt->execute([$ref]);
            $tx = $stmt->fetch();
            
            if ($tx && $tx['status'] !== 'CANCELLED') {
                $stmtItems = $pdo->prepare("SELECT quantity FROM transaction_items WHERE transactionId = ? AND productId = ?");
                $stmtItems->execute([$ref, $productId]);
                $item = $stmtItems->fetch();
                
                if ($item) {
                    $stmtRevert = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
                    $stmtRevert->execute([$item['quantity'], $productId]);
                }
                
                $stmtStatus = $pdo->prepare("UPDATE transactions SET status = 'CANCELLED', paymentStatus = 'CANCELLED' WHERE id = ?");
                $stmtStatus->execute([$ref]);
            }
        } else if (strpos($ref, 'ORD-') === 0) {
            $stmt = $pdo->prepare("SELECT status FROM orders WHERE id = ?");
            $stmt->execute([$ref]);
            $order = $stmt->fetch();
            
            if ($order && $order['status'] === 'RECEIVED') {
                $stmtItems = $pdo->prepare("SELECT productId, quantity FROM order_items WHERE orderId = ?");
                $stmtItems->execute([$ref]);
                $items = $stmtItems->fetchAll();
                
                // Revert stock: order was added to stock, so subtract it
                foreach ($items as $item) {
                    $stmtRevert = $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
                    $stmtRevert->execute([$item['quantity'], $item['productId']]);
                }
                
                // Set status to CANCELLED or APPROVED? User said "membatalkan transaksi order"
                $stmtStatus = $pdo->prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?");
                $stmtStatus->execute([$ref]);
            }
        }
    } else if ($action === 'approve_adjustment') {
        $adjId = str_replace('ADJ-', '', $ref);
        $stmt = $pdo->prepare("SELECT quantity, type, status, productId FROM stock_adjustments WHERE id = ?");
        $stmt->execute([$adjId]);
        $adj = $stmt->fetch();
        
        if ($adj && $adj['status'] === 'PENDING') {
            $isAddition = ($adj['type'] === 'IN' || $adj['type'] === 'RESTOCK' || $adj['type'] === 'RETURN');
            $mutation = $isAddition ? (int)$adj['quantity'] : -(int)$adj['quantity'];
            
            // Apply mutation to stock
            $stmtUpdateStock = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
            $stmtUpdateStock->execute([$mutation, $adj['productId']]);
            
            // Update status to NORMAL
            $stmtStatus = $pdo->prepare("UPDATE stock_adjustments SET status = 'NORMAL' WHERE id = ?");
            $stmtStatus->execute([$adjId]);
        }
    } else if ($action === 'edit') {
        $newDate = $data['date'] ?? '';
        $newQty = (int)($data['qty'] ?? 0); // This is the mutation value (e.g. -5 for sale, +10 for receipt)
        
        if (strpos($ref, 'ADJ-') === 0) {
            $adjId = str_replace('ADJ-', '', $ref);
            $stmt = $pdo->prepare("SELECT quantity, type, status FROM stock_adjustments WHERE id = ?");
            $stmt->execute([$adjId]);
            $oldAdj = $stmt->fetch();
            
            if ($oldAdj) {
                $isAddition = ($oldAdj['type'] === 'IN' || $oldAdj['type'] === 'RESTOCK' || $oldAdj['type'] === 'RETURN');
                $oldMutation = $isAddition ? (int)$oldAdj['quantity'] : -(int)$oldAdj['quantity'];
                
                // Hanya revert dan apply stok jika statusnya NORMAL atau REVISED
                if ($oldAdj['status'] === 'NORMAL' || $oldAdj['status'] === 'REVISED') {
                    // Revert old mutation: stock = stock - oldMutation
                    $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?")->execute([$oldMutation, $productId]);
                    
                    // Apply new mutation (newQty is already effective mutation)
                    $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?")->execute([$newQty, $productId]);
                    
                    $status = 'REVISED';
                } else {
                    // Jika PENDING, biarkan tetap PENDING atau update datanya saja
                    $status = $oldAdj['status'];
                }
                
                $absNewQty = abs($newQty);
                $stmtUpdate = $pdo->prepare("UPDATE stock_adjustments SET quantity = ?, timestamp = ?, status = ? WHERE id = ?");
                $stmtUpdate->execute([$absNewQty, $newDate, $status, $adjId]);
            }
        } else if (strpos($ref, 'TXN-') === 0 || strpos($ref, 'TX-') === 0) {
            $stmtItems = $pdo->prepare("SELECT quantity, price FROM transaction_items WHERE transactionId = ? AND productId = ?");
            $stmtItems->execute([$ref, $productId]);
            $oldItem = $stmtItems->fetch();
            
            if ($oldItem) {
                // Revert old stock (sale was subtraction, so add back)
                $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?")->execute([$oldItem['quantity'], $productId]);
                
                // Apply new stock (sale is subtraction, newQty is negative)
                $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?")->execute([$newQty, $productId]);
                
                $absQty = abs($newQty);
                // Update transaction item
                $stmtUpdateItem = $pdo->prepare("UPDATE transaction_items SET quantity = ?, subtotal = ? * price WHERE transactionId = ? AND productId = ?");
                $stmtUpdateItem->execute([$absQty, $absQty, $ref, $productId]);
                
                // Recalculate transaction total
                $pdo->exec("UPDATE transactions t SET total = (SELECT SUM(subtotal) FROM transaction_items WHERE transactionId = t.id) WHERE id = '$ref'");
                
                $stmtUpdateTx = $pdo->prepare("UPDATE transactions SET timestamp = ?, status = 'REVISED' WHERE id = ?");
                $stmtUpdateTx->execute([$newDate, $ref]);
            }
        } else if (strpos($ref, 'ORD-') === 0) {
            $stmt = $pdo->prepare("SELECT status, receivedAt FROM orders WHERE id = ?");
            $stmt->execute([$ref]);
            $order = $stmt->fetch();
            
            if ($order && $order['status'] === 'RECEIVED') {
                // Update receivedAt date
                $stmtUpdateOrder = $pdo->prepare("UPDATE orders SET receivedAt = ? WHERE id = ?");
                $stmtUpdateOrder->execute([$newDate, $ref]);
                
                // Update quantity for this specific product
                $stmtItem = $pdo->prepare("SELECT quantity FROM order_items WHERE orderId = ? AND productId = ?");
                $stmtItem->execute([$ref, $productId]);
                $oldItem = $stmtItem->fetch();
                
                if ($oldItem) {
                    $oldQty = (int)$oldItem['quantity'];
                    // Revert old stock (receipt was addition, so subtract)
                    $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?")->execute([$oldQty, $productId]);
                    
                    // Apply new stock (receipt is addition, newQty is positive)
                    $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?")->execute([$newQty, $productId]);
                    
                    // Update order_items
                    $stmtUpdateItem = $pdo->prepare("UPDATE order_items SET quantity = ?, subtotal = ? * estimatedCost WHERE orderId = ? AND productId = ?");
                    $stmtUpdateItem->execute([$newQty, $newQty, $ref, $productId]);
                    
                    // Recalculate order totalCost
                    $pdo->exec("UPDATE orders o SET totalCost = (SELECT SUM(subtotal) FROM order_items WHERE orderId = o.id) WHERE id = '$ref'");
                }
            }
        } else if ($ref === 'STOK-AWAL') {
            $stmt = $pdo->prepare("SELECT stock, initialStock FROM products WHERE id = ?");
            $stmt->execute([$productId]);
            $product = $stmt->fetch();
            
            if ($product) {
                // Revert old initial stock from current stock
                $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?")->execute([$product['initialStock'], $productId]);
                
                // Apply new initial stock to current stock
                $pdo->prepare("UPDATE products SET stock = stock + ?, initialStock = ?, initialStockDate = ?, status = 'REVISED' WHERE id = ?")
                    ->execute([$newQty, $newQty, $newDate, $productId]);
            }
        }
    }

    $pdo->commit();
    sendResponse(["status" => "success", "message" => "Audit action completed successfully."]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
