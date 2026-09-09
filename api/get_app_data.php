<?php
require_once 'db.php';

try {
    $tables = ['products', 'categories', 'transactions', 'app_settings', 'shipping_rates', 'orders', 'members', 'member_logs', 'stock_adjustments', 'expenses', 'product_proposals', 'activity_logs'];
    $data = [];

    $role = $_GET['role'] ?? 'MEMBER';
    $userId = $_GET['userId'] ?? '';
    
    // Normalize Member ID if it has USER- prefix from users table
    $memberSearchId = (strpos($userId, 'USER-') === 0) ? substr($userId, 5) : $userId;

    $tenantUser = null;
    $tenantCategories = [];
    $tenantCategoriesUpper = [];

    if ($role === 'TENANT') {
        $userIdNorm = trim($userId);
        $userIdNoPrefix = preg_replace('/^(USER-|USR-)/i', '', $userIdNorm);
        $userIdWithUser = 'USER-' . $userIdNoPrefix;
        $userIdWithUsr = 'USR-' . $userIdNoPrefix;

        $uStmt = $pdo->prepare("SELECT * FROM users WHERE (id = ? OR id = ? OR id = ? OR id = ? OR email = ?) AND (status = 'ACTIVE' OR status IS NULL OR status = '') LIMIT 1");
        $uStmt->execute([$userIdNorm, $userIdNoPrefix, $userIdWithUser, $userIdWithUsr, $userIdNorm]);
        $tenantUser = $uStmt->fetch();
        if ($tenantUser) {
            unset($tenantUser['password']);
            if (!isset($tenantUser['createdAt'])) {
                $tenantUser['createdAt'] = $tenantUser['created_at'] ?? date('Y-m-d H:i:s');
            }
            if (!empty($tenantUser['tenantCategories'])) {
                $tenantCategories = is_array($tenantUser['tenantCategories']) ? $tenantUser['tenantCategories'] : (json_decode($tenantUser['tenantCategories'], true) ?? []);
            }
            $tenantUser['tenantCategories'] = $tenantCategories;
            $data['user_profile'] = $tenantUser;
            $tenantCategoriesUpper = array_values(array_filter(array_map(function($c) { return strtoupper(trim($c)); }, $tenantCategories)));
        }
    }

    $tables = ['app_settings', 'shipping_rates', 'categories', 'products', 'messages'];
    if ($role === 'ADMIN' || $role === 'STAFF' || $role === 'TENANT' || $role === 'USER' || $role === 'VISITOR') {
        $tables = array_merge($tables, ['members', 'transactions', 'member_logs', 'stock_adjustments', 'orders', 'expenses', 'product_proposals', 'activity_logs']);
        if ($role === 'ADMIN' || $role === 'STAFF' || $role === 'TENANT' || $role === 'VISITOR') {
            $tables[] = 'users';
        }
    } elseif ($role === 'MEMBER') {
        $tables = array_merge($tables, ['members', 'transactions', 'member_logs', 'member_profile']);
    }

    foreach ($tables as $table) {
        try {
            if ($table === 'member_profile') {
                $stmt = $pdo->prepare("SELECT * FROM members WHERE id = ? OR email = ? LIMIT 1");
                $stmt->execute([$memberSearchId, $userId]);
                $prof = $stmt->fetch();
                if ($prof) {
                    $prof['depositBalance'] = (float)$prof['depositBalance'];
                    $prof['registrationDate'] = str_replace(' ', 'T', $prof['registrationDate']);
                }
                $data['member_profile'] = $prof;
            } elseif ($table === 'app_settings') {
                $raw = $pdo->query("SELECT * FROM app_settings")->fetchAll();
                $settings = [];
                foreach ($raw as $row) { 
                    $settings[$row['setting_key']] = json_decode($row['setting_value'], true) ?? $row['setting_value'];
                }
                $data['settings'] = $settings;
            } elseif ($table === 'shipping_rates') {
                $rates = $pdo->query("SELECT * FROM shipping_rates WHERE status = 'ACTIVE' ORDER BY minDistance ASC")->fetchAll();
                foreach ($rates as &$r) {
                    $r['minDistance'] = (float)$r['minDistance'];
                    $r['maxDistance'] = (float)$r['maxDistance'];
                    $r['rate'] = (float)$r['rate'];
                }
                $data['shipping_rates'] = $rates;
            } elseif ($table === 'transactions') {
                if ($role === 'TENANT') {
                    if (empty($tenantCategoriesUpper)) {
                        $data['transactions'] = [];
                    } else {
                        $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
                        $sql = "SELECT DISTINCT t.* FROM transactions t 
                                JOIN transaction_items ti ON t.id = ti.transactionId 
                                WHERE UPPER(TRIM(ti.category)) IN ($catPlaceholders) 
                                ORDER BY t.timestamp DESC LIMIT 300";
                        $txStmt = $pdo->prepare($sql);
                        $txStmt->execute($tenantCategoriesUpper);
                        $txs = $txStmt->fetchAll();

                        if ($txs) {
                            $txIds = array_column($txs, 'id');
                            $txPlaceholders = implode(',', array_fill(0, count($txIds), '?'));
                            $stmtItems = $pdo->prepare("SELECT * FROM transaction_items WHERE transactionId IN ($txPlaceholders) AND UPPER(TRIM(category)) IN ($catPlaceholders)");
                            $stmtItems->execute(array_merge($txIds, $tenantCategoriesUpper));
                            $itemsAll = $stmtItems->fetchAll();
                            $itemsGrouped = [];
                            foreach ($itemsAll as $item) {
                                $item['quantity'] = (int)$item['quantity'];
                                $item['price'] = (float)$item['price'];
                                $item['costPrice'] = (float)$item['costPrice'];
                                $item['subtotal'] = (float)$item['subtotal'];
                                $itemsGrouped[$item['transactionId']][] = $item;
                            }
                            foreach ($txs as &$tx) {
                                $tx['timestamp'] = str_replace(' ', 'T', $tx['timestamp']);
                                if (isset($tx['receivedAt']) && $tx['receivedAt']) $tx['receivedAt'] = str_replace(' ', 'T', $tx['receivedAt']);
                                $tx['items'] = $itemsGrouped[$tx['id']] ?? [];
                                $tx['total'] = array_reduce($tx['items'], function($sum, $it) { return $sum + $it['subtotal']; }, 0);
                                $tx['shippingCost'] = 0;
                            }
                        }
                        $data['transactions'] = $txs;
                    }
                } else {
                    $sql = "SELECT * FROM transactions ";
                    $params = [];
                    if ($role === 'MEMBER') {
                        $sql .= "WHERE (memberId = ? OR customerName = ? OR staffId = ? OR memberId = ?) ";
                        $params = [$memberSearchId, $userId, $userId, $userId];
                    }
                    $sql .= "ORDER BY timestamp DESC LIMIT 300";
                    $txStmt = $pdo->prepare($sql);
                    $txStmt->execute($params);
                    $txs = $txStmt->fetchAll();
                    
                    if ($txs) {
                        $txIds = array_column($txs, 'id');
                        $placeholders = implode(',', array_fill(0, count($txIds), '?'));
                        $stmtItems = $pdo->prepare("SELECT * FROM transaction_items WHERE transactionId IN ($placeholders)");
                        $stmtItems->execute($txIds);
                        $itemsAll = $stmtItems->fetchAll();
                        $itemsGrouped = [];
                        foreach ($itemsAll as $item) {
                            $item['quantity'] = (int)$item['quantity'];
                            $item['price'] = (float)$item['price'];
                            $item['costPrice'] = (float)$item['costPrice'];
                            $item['subtotal'] = (float)$item['subtotal'];
                            $itemsGrouped[$item['transactionId']][] = $item;
                        }
                        foreach ($txs as &$tx) {
                            $tx['timestamp'] = str_replace(' ', 'T', $tx['timestamp']);
                            if (isset($tx['receivedAt']) && $tx['receivedAt']) $tx['receivedAt'] = str_replace(' ', 'T', $tx['receivedAt']);
                            $tx['total'] = (float)$tx['total'];
                            $tx['shippingCost'] = (float)($tx['shippingCost'] ?? 0);
                            $tx['items'] = $itemsGrouped[$tx['id']] ?? [];
                        }
                    }
                    $data['transactions'] = $txs;
                }
            } elseif ($table === 'categories') {
                if ($role === 'TENANT') {
                    if (empty($tenantCategoriesUpper)) {
                        $data['categories'] = [];
                    } else {
                        $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
                        $stmt = $pdo->prepare("SELECT * FROM categories WHERE status = 'ACTIVE' AND UPPER(TRIM(name)) IN ($catPlaceholders) ORDER BY name ASC");
                        $stmt->execute($tenantCategoriesUpper);
                        $data['categories'] = $stmt->fetchAll();
                    }
                } else {
                    $data['categories'] = $pdo->query("SELECT * FROM categories WHERE status = 'ACTIVE' ORDER BY name ASC")->fetchAll();
                }
            } elseif ($table === 'products') {
                if ($role === 'TENANT') {
                    if (empty($tenantCategoriesUpper)) {
                        $data['products'] = [];
                    } else {
                        $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
                        $stmtProds = $pdo->prepare("
                            SELECT p.*, 
                                   COALESCE(s.total_sold, 0) as total_sold,
                                   COALESCE(s.first_sale, p.initialStockDate, p.status) as start_date
                            FROM products p
                            LEFT JOIN (
                                SELECT productId, SUM(quantity) as total_sold, MIN(timestamp) as first_sale
                                FROM transaction_items ti
                                JOIN transactions t ON ti.transactionId = t.id
                                WHERE t.status != 'CANCELLED'
                                GROUP BY productId
                            ) s ON p.id = s.productId
                            WHERE (p.status != 'INACTIVE' OR p.status IS NULL OR p.status = '') 
                              AND UPPER(TRIM(p.category)) IN ($catPlaceholders)
                            ORDER BY p.name ASC
                        ");
                        $stmtProds->execute($tenantCategoriesUpper);
                        $prods = $stmtProds->fetchAll();

                        $now = new DateTime();
                        foreach ($prods as &$p) {
                            $p['price'] = (float)$p['price'];
                            $p['costPrice'] = (float)$p['costPrice'];
                            $p['stock'] = (int)$p['stock'];
                            $p['initialStock'] = (int)($p['initialStock'] ?? $p['stock']);
                            $p['minStock'] = (int)$p['minStock'];
                            
                            $startDateStr = $p['start_date'];
                            if (!$startDateStr || strlen($startDateStr) < 10) {
                                $startDateStr = date('Y-m-d');
                            }
                            try {
                                $startDate = new DateTime($startDateStr);
                                $diff = $now->diff($startDate);
                                $months = ($diff->y * 12) + $diff->m;
                                if ($months < 1) $months = 1;
                                $p['avgMonthlySales'] = round($p['total_sold'] / $months, 2);
                            } catch (Exception $e) {
                                $p['avgMonthlySales'] = 0;
                            }
                            if (isset($p['initialStockDate']) && $p['initialStockDate']) {
                                $p['initialStockDate'] = str_replace(' ', 'T', $p['initialStockDate']);
                            }
                            unset($p['total_sold']);
                            unset($p['start_date']);
                        }
                        $data['products'] = $prods;
                    }
                } else {
                    // Ambil data produk beserta rata-rata penjualan
                    $prods = $pdo->query("
                        SELECT p.*, 
                               COALESCE(s.total_sold, 0) as total_sold,
                               COALESCE(s.first_sale, p.initialStockDate, p.status) as start_date
                        FROM products p
                        LEFT JOIN (
                            SELECT productId, SUM(quantity) as total_sold, MIN(timestamp) as first_sale
                            FROM transaction_items ti
                            JOIN transactions t ON ti.transactionId = t.id
                            WHERE t.status != 'CANCELLED'
                            GROUP BY productId
                        ) s ON p.id = s.productId
                        WHERE (p.status != 'INACTIVE' OR p.status IS NULL OR p.status = '') 
                        ORDER BY p.name ASC
                    ")->fetchAll();

                    $now = new DateTime();
                    foreach ($prods as &$p) {
                        $p['price'] = (float)$p['price'];
                        $p['costPrice'] = (float)$p['costPrice'];
                        $p['stock'] = (int)$p['stock'];
                        $p['initialStock'] = (int)($p['initialStock'] ?? $p['stock']);
                        $p['minStock'] = (int)$p['minStock'];
                        
                        $startDateStr = $p['start_date'];
                        if (!$startDateStr || strlen($startDateStr) < 10) {
                            $startDateStr = date('Y-m-d');
                        }
                        try {
                            $startDate = new DateTime($startDateStr);
                            $diff = $now->diff($startDate);
                            $months = ($diff->y * 12) + $diff->m;
                            if ($months < 1) $months = 1;
                            $p['avgMonthlySales'] = round($p['total_sold'] / $months, 2);
                        } catch (Exception $e) {
                            $p['avgMonthlySales'] = 0;
                        }
                        if (isset($p['initialStockDate']) && $p['initialStockDate']) {
                            $p['initialStockDate'] = str_replace(' ', 'T', $p['initialStockDate']);
                        }
                        unset($p['total_sold']);
                        unset($p['start_date']);
                    }
                    $data['products'] = $prods;
                }
            } elseif ($table === 'members') {
                if ($role === 'MEMBER') {
                    $mStmt = $pdo->prepare("SELECT * FROM members WHERE id = ? OR email = ?");
                    $mStmt->execute([$memberSearchId, $userId]);
                    $mems = $mStmt->fetchAll();
                } else {
                    $mems = $pdo->query("SELECT * FROM members ORDER BY registrationDate DESC")->fetchAll();
                }

                foreach ($mems as &$m) {
                    $m['depositBalance'] = (float)$m['depositBalance'];
                    $m['registrationDate'] = str_replace(' ', 'T', $m['registrationDate']);
                }
                $data['members'] = $mems;
            } elseif ($table === 'member_logs') {
                if ($role === 'TENANT') {
                    $data['member_logs'] = [];
                } else {
                    $sql = "SELECT * FROM member_logs ";
                    $params = [];
                    if ($role === 'MEMBER') {
                        $sql .= "WHERE memberId = ? OR memberId = ? ";
                        $params = [$memberSearchId, $userId];
                    }
                    $sql .= "ORDER BY timestamp DESC LIMIT 500";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                    $logs = $stmt->fetchAll();
                    foreach ($logs as &$l) {
                        $l['amount'] = (float)$l['amount'];
                        $l['timestamp'] = str_replace(' ', 'T', $l['timestamp']);
                    }
                    $data['member_logs'] = $logs;
                }
            } elseif ($table === 'stock_adjustments') {
                if ($role === 'TENANT') {
                    if (empty($tenantCategoriesUpper)) {
                        $data['stock_adjustments'] = [];
                    } else {
                        $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
                        $stmt = $pdo->prepare("
                            SELECT sa.* FROM stock_adjustments sa 
                            JOIN products p ON sa.productId = p.id 
                            WHERE UPPER(TRIM(p.category)) IN ($catPlaceholders) 
                            ORDER BY sa.timestamp DESC
                        ");
                        $stmt->execute($tenantCategoriesUpper);
                        $adjs = $stmt->fetchAll();
                        foreach ($adjs as &$adj) {
                            $adj['timestamp'] = str_replace(' ', 'T', $adj['timestamp']);
                            $adj['quantity'] = (int)$adj['quantity'];
                        }
                        $data['stock_adjustments'] = $adjs;
                    }
                } else {
                    $adjs = $pdo->query("SELECT * FROM stock_adjustments ORDER BY timestamp DESC")->fetchAll();
                    foreach ($adjs as &$adj) {
                        $adj['timestamp'] = str_replace(' ', 'T', $adj['timestamp']);
                        $adj['quantity'] = (int)$adj['quantity'];
                    }
                    $data['stock_adjustments'] = $adjs;
                }
            } elseif ($table === 'expenses') {
                if ($role === 'TENANT') {
                    if (empty($tenantCategoriesUpper)) {
                        $data['expenses'] = [];
                    } else {
                        $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
                        $stmt = $pdo->prepare("SELECT * FROM expenses WHERE UPPER(TRIM(category)) IN ($catPlaceholders) ORDER BY date DESC");
                        $stmt->execute($tenantCategoriesUpper);
                        $exps = $stmt->fetchAll();
                        foreach ($exps as &$e) {
                            $e['amount'] = (float)$e['amount'];
                        }
                        $data['expenses'] = $exps;
                    }
                } else {
                    $exps = $pdo->query("SELECT * FROM expenses ORDER BY date DESC")->fetchAll();
                    foreach ($exps as &$e) {
                        $e['amount'] = (float)$e['amount'];
                    }
                    $data['expenses'] = $exps;
                }
            } elseif ($table === 'orders') {
                if ($role === 'TENANT') {
                    if (empty($tenantCategoriesUpper)) {
                        $data['orders'] = [];
                    } else {
                        $catPlaceholders = implode(',', array_fill(0, count($tenantCategoriesUpper), '?'));
                        $stmtOrds = $pdo->prepare("
                            SELECT DISTINCT o.* FROM orders o 
                            JOIN order_items oi ON o.id = oi.orderId 
                            JOIN products p ON oi.productId = p.id 
                            WHERE UPPER(TRIM(p.category)) IN ($catPlaceholders) 
                            ORDER BY o.createdAt DESC LIMIT 300
                        ");
                        $stmtOrds->execute($tenantCategoriesUpper);
                        $ords = $stmtOrds->fetchAll();

                        if ($ords) {
                            $ordIds = array_column($ords, 'id');
                            $ordPlaceholders = implode(',', array_fill(0, count($ordIds), '?'));
                            $stmtItems = $pdo->prepare("
                                SELECT oi.* FROM order_items oi 
                                JOIN products p ON oi.productId = p.id 
                                WHERE oi.orderId IN ($ordPlaceholders) AND UPPER(TRIM(p.category)) IN ($catPlaceholders)
                            ");
                            $stmtItems->execute(array_merge($ordIds, $tenantCategoriesUpper));
                            $itemsAll = $stmtItems->fetchAll();
                            $itemsGrouped = [];
                            foreach ($itemsAll as $item) {
                                $item['quantity'] = (int)$item['quantity'];
                                $item['estimatedCost'] = (float)$item['estimatedCost'];
                                $item['subtotal'] = (float)$item['subtotal'];
                                $itemsGrouped[$item['orderId']][] = $item;
                            }
                            foreach ($ords as &$o) {
                                $o['items'] = $itemsGrouped[$o['id']] ?? [];
                                $o['totalCost'] = array_reduce($o['items'], function($sum, $it) { return $sum + $it['subtotal']; }, 0);
                                $o['createdAt'] = str_replace(' ', 'T', $o['createdAt']);
                                if (isset($o['receivedAt'])) $o['receivedAt'] = str_replace(' ', 'T', $o['receivedAt']);
                                if (isset($o['approvedAt'])) $o['approvedAt'] = str_replace(' ', 'T', $o['approvedAt']);
                            }
                        }
                        $data['orders'] = $ords;
                    }
                } else {
                    $ords = $pdo->query("SELECT * FROM orders ORDER BY createdAt DESC LIMIT 300")->fetchAll();
                    if ($ords) {
                        $ordIds = array_column($ords, 'id');
                        $placeholders = implode(',', array_fill(0, count($ordIds), '?'));
                        $stmtItems = $pdo->prepare("SELECT * FROM order_items WHERE orderId IN ($placeholders)");
                        $stmtItems->execute($ordIds);
                        $itemsAll = $stmtItems->fetchAll();
                        $itemsGrouped = [];
                        foreach ($itemsAll as $item) {
                            $item['quantity'] = (int)$item['quantity'];
                            $item['estimatedCost'] = (float)$item['estimatedCost'];
                            $item['subtotal'] = (float)$item['subtotal'];
                            $itemsGrouped[$item['orderId']][] = $item;
                        }
                        foreach ($ords as &$o) {
                            $o['totalCost'] = (float)$o['totalCost'];
                            $o['createdAt'] = str_replace(' ', 'T', $o['createdAt']);
                            if (isset($o['receivedAt'])) $o['receivedAt'] = str_replace(' ', 'T', $o['receivedAt']);
                            if (isset($o['approvedAt'])) $o['approvedAt'] = str_replace(' ', 'T', $o['approvedAt']);
                            $o['items'] = $itemsGrouped[$o['id']] ?? [];
                        }
                    }
                    $data['orders'] = $ords;
                }
            } elseif ($table === 'product_proposals') {
                $props = $pdo->query("SELECT * FROM product_proposals ORDER BY createdAt DESC")->fetchAll();
                $parsedProps = [];
                foreach ($props as &$p) {
                    $p['data'] = json_decode($p['data'] ?? '{}', true);
                    if ($role === 'TENANT') {
                        if (empty($tenantCategoriesUpper)) continue;
                        $propCat = strtoupper(trim($p['data']['category'] ?? ''));
                        $isMyStaff = ($tenantUser && $p['staffId'] === $tenantUser['name']);
                        if (in_array($propCat, $tenantCategoriesUpper) || $isMyStaff) {
                            $parsedProps[] = $p;
                        }
                    } else {
                        $parsedProps[] = $p;
                    }
                }
                $data['product_proposals'] = $parsedProps;
            } elseif ($table === 'activity_logs') {
                $data['activity_logs'] = $pdo->query("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100")->fetchAll();
            } elseif ($table === 'users') {
                $userList = $pdo->query("SELECT * FROM users ORDER BY name ASC")->fetchAll();
                foreach ($userList as &$u) {
                    unset($u['password']);
                    if (!isset($u['createdAt'])) {
                        $u['createdAt'] = $u['created_at'] ?? date('Y-m-d H:i:s');
                    }
                    if (isset($u['tenantCategories']) && $u['tenantCategories']) {
                        $u['tenantCategories'] = is_array($u['tenantCategories']) ? $u['tenantCategories'] : (json_decode($u['tenantCategories'], true) ?? []);
                    } else {
                        $u['tenantCategories'] = [];
                    }
                }
                $data['users'] = $userList;
            } elseif ($table === 'messages') {
                if ($role === 'MEMBER') {
                    $mStmt = $pdo->prepare("SELECT * FROM messages WHERE senderId = ? OR receiverId = ? ORDER BY timestamp ASC");
                    $mStmt->execute([$memberSearchId, $memberSearchId]);
                    $msgs = $mStmt->fetchAll();
                } elseif ($role === 'TENANT') {
                    $candidateIds = array_values(array_unique(array_filter([
                        $userId,
                        trim($userId),
                        $tenantUser ? $tenantUser['id'] : null,
                        $tenantUser ? $tenantUser['name'] : null,
                        isset($userIdNoPrefix) ? $userIdNoPrefix : null,
                        isset($userIdWithUser) ? $userIdWithUser : null,
                        isset($userIdWithUsr) ? $userIdWithUsr : null,
                    ])));
                    
                    if (empty($candidateIds)) {
                        $candidateIds = [$userId];
                    }
                    $inPlaceholders = implode(',', array_fill(0, count($candidateIds), '?'));
                    $sql = "SELECT * FROM messages 
                            WHERE receiverId = 'TENANT_ROOM' 
                               OR senderId IN ($inPlaceholders) 
                               OR receiverId IN ($inPlaceholders) 
                            ORDER BY timestamp ASC";
                    $mStmt = $pdo->prepare($sql);
                    $mStmt->execute(array_merge($candidateIds, $candidateIds));
                    $msgs = $mStmt->fetchAll();
                } elseif ($role === 'VISITOR') {
                    $candidateIds = array_values(array_unique(array_filter([
                        $userId,
                        trim($userId),
                        isset($userIdNoPrefix) ? $userIdNoPrefix : null,
                        isset($userIdWithUser) ? $userIdWithUser : null,
                        isset($userIdWithUsr) ? $userIdWithUsr : null,
                    ])));
                    if (empty($candidateIds)) {
                        $candidateIds = [$userId];
                    }
                    $inPlaceholders = implode(',', array_fill(0, count($candidateIds), '?'));
                    $sql = "SELECT * FROM messages 
                            WHERE receiverId = 'INTERNAL' 
                               OR ((senderId IN ($inPlaceholders) OR receiverId IN ($inPlaceholders)) 
                                   AND senderRole IN ('ADMIN', 'STAFF', 'VISITOR') 
                                   AND receiverRole IN ('ADMIN', 'STAFF', 'VISITOR')) 
                            ORDER BY timestamp ASC";
                    $mStmt = $pdo->prepare($sql);
                    $mStmt->execute(array_merge($candidateIds, $candidateIds));
                    $msgs = $mStmt->fetchAll();
                } else {
                    $msgs = $pdo->query("SELECT * FROM messages ORDER BY timestamp ASC")->fetchAll();
                }
                foreach ($msgs as &$msg) {
                    $msg['timestamp'] = str_replace(' ', 'T', $msg['timestamp']);
                    $msg['isRead'] = (int)$msg['isRead'];
                }
                $data['messages'] = $msgs;
            } else {
                $data[$table] = $pdo->query("SELECT * FROM $table")->fetchAll();
            }
        } catch (Exception $e) { $data[$table] = []; }
    }
    sendResponse($data);
} catch (Exception $e) {
    sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
}
