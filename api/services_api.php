<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_guard.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Helper to log admin/staff actions
function logServiceActivity($pdo, $staffName, $category, $actionType, $entityId, $before, $after) {
    try {
        $stmt = $pdo->prepare("INSERT INTO activity_logs (staff_name, menu_category, action_type, entity_id, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $staffName,
            $category,
            $actionType,
            $entityId,
            json_encode($before),
            json_encode($after)
        ]);
    } catch (Exception $e) {}
}

if ($action === 'get_offerings') {
    try {
        $stmt = $pdo->query("SELECT * FROM service_offerings WHERE status != 'DELETED' ORDER BY service_type, id DESC");
        sendResponse(["status" => "success", "offerings" => $stmt->fetchAll()]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

elseif ($action === 'save_offering' && $method === 'POST') {
    $user = requireAuth(['ADMIN', 'STAFF']);
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? null;
    $serviceType = $data['service_type'] ?? 'CATERING';
    $vendorOrFleet = $data['vendor_or_fleet'] ?? '';
    $title = $data['title'] ?? '';
    $description = $data['description'] ?? '';
    $imageUrl = $data['image_url'] ?? '';
    $menuOrFacilities = $data['menu_or_facilities'] ?? '';

    if ($id) {
        $stmtOld = $pdo->prepare("SELECT * FROM service_offerings WHERE id = ?");
        $stmtOld->execute([$id]);
        $old = $stmtOld->fetch();

        $stmt = $pdo->prepare("UPDATE service_offerings SET service_type = ?, vendor_or_fleet = ?, title = ?, description = ?, image_url = ?, menu_or_facilities = ? WHERE id = ?");
        $stmt->execute([$serviceType, $vendorOrFleet, $title, $description, $imageUrl, $menuOrFacilities, $id]);
        logServiceActivity($pdo, $user['name'], 'SERVICES_CMS', 'UPDATE', $id, $old, $data);
    } else {
        $stmt = $pdo->prepare("INSERT INTO service_offerings (service_type, vendor_or_fleet, title, description, image_url, menu_or_facilities) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$serviceType, $vendorOrFleet, $title, $description, $imageUrl, $menuOrFacilities]);
        $newId = $pdo->lastInsertId();
        logServiceActivity($pdo, $user['name'], 'SERVICES_CMS', 'CREATE', $newId, [], $data);
    }
    sendResponse(["status" => "success", "message" => "Konten penawaran berhasil disimpan."]);
}

elseif ($action === 'delete_offering' && $method === 'POST') {
    $user = requireAuth(['ADMIN', 'STAFF']);
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? null;
    if (!$id) sendResponse(["status" => "error", "message" => "ID tidak valid."], 400);

    $stmt = $pdo->prepare("SELECT * FROM service_offerings WHERE id = ?");
    $stmt->execute([$id]);
    $old = $stmt->fetch();

    // Soft Delete
    $stmtDel = $pdo->prepare("UPDATE service_offerings SET status = 'DELETED' WHERE id = ?");
    $stmtDel->execute([$id]);
    logServiceActivity($pdo, $user['name'], 'SERVICES_CMS', 'DELETE', $id, $old, ['status' => 'DELETED']);
    sendResponse(["status" => "success", "message" => "Konten berhasil dihapus (soft delete tersimpan di log)."]);
}

elseif ($action === 'get_tariffs') {
    try {
        $stmt = $pdo->query("SELECT * FROM service_tariffs");
        sendResponse(["status" => "success", "tariffs" => $stmt->fetchAll()]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

elseif ($action === 'save_tariff' && $method === 'POST') {
    $user = requireAuth(['ADMIN']);
    $data = json_decode(file_get_contents('php://input'), true);
    $serviceType = $data['service_type'] ?? '';
    $categoryKey = $data['category_key'] ?? '';
    $subCategory = $data['sub_category'] ?? '';
    $price = (float)($data['price'] ?? 0);

    // Upsert tariff
    $stmtCheck = $pdo->prepare("SELECT id FROM service_tariffs WHERE service_type = ? AND category_key = ? AND sub_category = ?");
    $stmtCheck->execute([$serviceType, $categoryKey, $subCategory]);
    $existing = $stmtCheck->fetch();

    if ($existing) {
        $stmt = $pdo->prepare("UPDATE service_tariffs SET price = ? WHERE id = ?");
        $stmt->execute([$price, $existing['id']]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO service_tariffs (service_type, category_key, sub_category, price) VALUES (?, ?, ?, ?)");
        $stmt->execute([$serviceType, $categoryKey, $subCategory, $price]);
    }
    sendResponse(["status" => "success", "message" => "Tarif berhasil disimpan."]);
}

elseif ($action === 'get_requests') {
    try {
        $stmt = $pdo->query("SELECT * FROM service_requests WHERE status != 'DELETED' ORDER BY id DESC");
        sendResponse(["status" => "success", "requests" => $stmt->fetchAll()]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

elseif ($action === 'submit_request' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $memberId = $data['member_id'] ?? '';
    $memberName = $data['member_name'] ?? '';
    $className = $data['class_name'] ?? '';
    $address = $data['address'] ?? '';
    $phone = $data['phone'] ?? '';
    $serviceType = $data['service_type'] ?? '';
    $subCategory = $data['sub_category'] ?? '';
    $vendorName = $data['vendor_name'] ?? '';
    $targetMonth = $data['target_month'] ?? '';

    if (!$memberId || !$serviceType || !$targetMonth || !$address) {
        sendResponse(["status" => "error", "message" => "Lengkapi data pengajuan layanan dengan benar."], 400);
    }

    $stmt = $pdo->prepare("INSERT INTO service_requests (member_id, member_name, class_name, address, phone, service_type, sub_category, vendor_name, target_month, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')");
    $stmt->execute([$memberId, $memberName, $className, $address, $phone, $serviceType, $subCategory, $vendorName, $targetMonth]);
    
    sendResponse(["status" => "success", "message" => "Pengajuan layanan berhasil dikirim dan menunggu verifikasi admin."]);
}

elseif ($action === 'approve_request' && $method === 'POST') {
    $user = requireAuth(['ADMIN', 'STAFF']);
    $data = json_decode(file_get_contents('php://input'), true);
    $requestId = $data['request_id'] ?? null;
    $assignedWilayah = $data['assigned_wilayah'] ?? null; // For Transport: A, B, C, D
    $effectiveDays = (int)($data['effective_days'] ?? 0); // For Catering
    $customAmount = isset($data['final_amount']) ? (float)$data['final_amount'] : null;
    $adminNotes = $data['admin_notes'] ?? '';

    if (!$requestId) sendResponse(["status" => "error", "message" => "ID Pengajuan tidak valid."], 400);

    $stmtReq = $pdo->prepare("SELECT * FROM service_requests WHERE id = ?");
    $stmtReq->execute([$requestId]);
    $req = $stmtReq->fetch();
    if (!$req) sendResponse(["status" => "error", "message" => "Pengajuan tidak ditemukan."], 404);

    $finalAmount = 0;
    $detailsText = "";

    if ($req['service_type'] === 'TRANSPORT') {
        $wilayah = $assignedWilayah ?: 'Wilayah A';
        // Fetch tariff from service_tariffs or default estimation
        $stmtT = $pdo->prepare("SELECT price FROM service_tariffs WHERE service_type = 'TRANSPORT' AND category_key = ? AND sub_category = ?");
        $stmtT->execute([$wilayah, $req['sub_category']]);
        $tariff = $stmtT->fetch();
        $basePrice = $tariff ? (float)$tariff['price'] : ($wilayah === 'Wilayah A' ? 250000 : ($wilayah === 'Wilayah B' ? 300000 : ($wilayah === 'Wilayah C' ? 350000 : 400000)));
        
        $finalAmount = $customAmount !== null ? $customAmount : $basePrice;
        $detailsText = "Jemputan - {$wilayah} ({$req['sub_category']})";
    } else {
        // CATERING
        $days = $effectiveDays > 0 ? $effectiveDays : 20;
        $stmtT = $pdo->prepare("SELECT price FROM service_tariffs WHERE service_type = 'CATERING' AND category_key = ?");
        $stmtT->execute([$req['vendor_name']]);
        $tariff = $stmtT->fetch();
        $dailyRate = $tariff ? (float)$tariff['price'] : 25000; // default 25k per porsi

        $finalAmount = $customAmount !== null ? $customAmount : ($dailyRate * $days);
        $detailsText = "Katering {$req['vendor_name']} - {$days} Hari Efektif";
    }

    // Update request status
    $stmtUp = $pdo->prepare("UPDATE service_requests SET status = 'APPROVED', assigned_wilayah = ?, effective_days = ?, final_amount = ?, admin_notes = ? WHERE id = ?");
    $stmtUp->execute([$assignedWilayah, $effectiveDays, $finalAmount, $adminNotes, $requestId]);

    // Generate Bill effective 1st of target month
    $billMonth = $req['target_month'];
    $stmtBill = $pdo->prepare("INSERT INTO service_bills (request_id, member_id, month, service_type, details, amount, status) VALUES (?, ?, ?, ?, ?, ?, 'UNPAID')");
    $stmtBill->execute([$requestId, $req['member_id'], $billMonth, $req['service_type'], $detailsText, $finalAmount]);

    logServiceActivity($pdo, $user['name'], 'SERVICES_APPROVE', 'APPROVE', $requestId, $req, ['status' => 'APPROVED', 'amount' => $finalAmount]);
    sendResponse(["status" => "success", "message" => "Pengajuan disetujui dan tagihan layanan berhasil diterbitkan."]);
}

elseif ($action === 'delete_request' && $method === 'POST') {
    $user = requireAuth(['ADMIN', 'STAFF']);
    $data = json_decode(file_get_contents('php://input'), true);
    $requestId = $data['request_id'] ?? null;
    if (!$requestId) sendResponse(["status" => "error", "message" => "ID tidak valid."], 400);

    $stmt = $pdo->prepare("SELECT * FROM service_requests WHERE id = ?");
    $stmt->execute([$requestId]);
    $old = $stmt->fetch();

    // Soft delete
    $stmtDel = $pdo->prepare("UPDATE service_requests SET status = 'DELETED' WHERE id = ?");
    $stmtDel->execute([$requestId]);

    logServiceActivity($pdo, $user['name'], 'SERVICES_REQUEST', 'DELETE', $requestId, $old, ['status' => 'DELETED']);
    sendResponse(["status" => "success", "message" => "Pengajuan berhasil dihapus (soft delete tersimpan di log)."]);
}

elseif ($action === 'get_bills') {
    $memberId = $_GET['member_id'] ?? '';
    try {
        if ($memberId) {
            $stmt = $pdo->prepare("SELECT * FROM service_bills WHERE member_id = ? OR member_id IN (SELECT childMemberId FROM member_guardians WHERE parentMemberId = ?) ORDER BY id DESC");
            $stmt->execute([$memberId, $memberId]);
        } else {
            $stmt = $pdo->query("SELECT * FROM service_bills ORDER BY id DESC");
        }
        sendResponse(["status" => "success", "bills" => $stmt->fetchAll()]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

elseif ($action === 'pay_bill' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $billId = $data['bill_id'] ?? null;
    $paymentMethod = $data['payment_method'] ?? 'DEPOSIT'; // DEPOSIT or TRANSFER
    $paymentProof = $data['payment_proof'] ?? '';

    if (!$billId) sendResponse(["status" => "error", "message" => "ID Tagihan tidak valid."], 400);

    $stmtB = $pdo->prepare("SELECT * FROM service_bills WHERE id = ?");
    $stmtB->execute([$billId]);
    $bill = $stmtB->fetch();
    if (!$bill) sendResponse(["status" => "error", "message" => "Tagihan tidak ditemukan."], 404);

    if ($paymentMethod === 'DEPOSIT') {
        // Check member deposit balance
        $stmtM = $pdo->prepare("SELECT id, name, depositBalance FROM members WHERE id = ?");
        $stmtM->execute([$bill['member_id']]);
        $member = $stmtM->fetch();
        if (!$member) sendResponse(["status" => "error", "message" => "Data member tidak ditemukan."], 404);

        if ((float)$member['depositBalance'] < (float)$bill['amount']) {
            sendResponse(["status" => "error", "message" => "Saldo deposit member tidak mencukupi untuk melunasi tagihan ini."], 400);
        }

        // Deduct deposit
        $stmtUpD = $pdo->prepare("UPDATE members SET depositBalance = depositBalance - ? WHERE id = ?");
        $stmtUpD->execute([$bill['amount'], $member['id']]);

        // Log deposit usage
        $stmtLog = $pdo->prepare("INSERT INTO member_logs (memberId, type, amount, description, timestamp) VALUES (?, 'USAGE', ?, ?, NOW())");
        $stmtLog->execute([$member['id'], $bill['amount'], "[PELUNASAN LAYANAN: {$bill['service_type']} - {$bill['month']}]"]);

        // Update bill status to PAID
        $stmtUpB = $pdo->prepare("UPDATE service_bills SET status = 'PAID', payment_method = 'DEPOSIT' WHERE id = ?");
        $stmtUpB->execute([$billId]);

        sendResponse(["status" => "success", "message" => "Tagihan berhasil dilunasi menggunakan Saldo Deposit."]);
    } else {
        // TRANSFER / PENDING verification
        $stmtUpB = $pdo->prepare("UPDATE service_bills SET status = 'PENDING', payment_method = 'TRANSFER', payment_proof = ? WHERE id = ?");
        $stmtUpB->execute([$paymentProof, $billId]);

        sendResponse(["status" => "success", "message" => "Konfirmasi pembayaran berhasil dikirim dan menunggu verifikasi staff."]);
    }
}
?>
