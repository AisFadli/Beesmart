<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_guard.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$auth = currentAuth() ?? [];
$role = strtoupper((string)($auth['role'] ?? ''));
$isStaff = in_array($role, ['ADMIN', 'STAFF'], true);

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

/**
 * Member yang boleh diakses oleh token saat ini: diri sendiri + anak aktif.
 * Menghindari IDOR: member_id tidak dipercaya dari query/body.
 */
function serviceMemberContext(PDO $pdo, array $auth): array
{
    $uid = (string)($auth['uid'] ?? '');
    $email = (string)($auth['email'] ?? '');
    $candidate = preg_replace('/^USER-/', '', $uid);

    $stmt = $pdo->prepare("SELECT id FROM members WHERE id = ? OR email = ? LIMIT 1");
    $stmt->execute([$candidate, $email]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['self' => null, 'allowed' => []];
    }

    $self = (string)$row['id'];
    $allowed = [$self];
    $guardians = $pdo->prepare("SELECT childMemberId FROM member_guardians WHERE parentMemberId = ? AND status = 'ACTIVE'");
    $guardians->execute([$self]);
    foreach ($guardians->fetchAll(PDO::FETCH_COLUMN) as $childId) {
        $allowed[] = (string)$childId;
    }

    return ['self' => $self, 'allowed' => array_values(array_unique($allowed))];
}

function serviceInClause(array $ids): string
{
    return implode(',', array_fill(0, max(1, count($ids)), '?'));
}

if ($action === 'get_offerings') {
    try {
        $stmt = $pdo->query("SELECT * FROM service_offerings WHERE (status = 'ACTIVE' OR status != 'DELETED' OR status IS NULL) ORDER BY service_type, id DESC");
        sendResponse(["status" => "success", "offerings" => $stmt->fetchAll()]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

elseif ($action === 'save_offering' && $method === 'POST') {
    requireAuth(['ADMIN', 'STAFF']);
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
        logServiceActivity($pdo, $auth['name'] ?? '', 'SERVICES_CMS', 'UPDATE', $id, $old, $data);
    } else {
        $stmt = $pdo->prepare("INSERT INTO service_offerings (service_type, vendor_or_fleet, title, description, image_url, menu_or_facilities) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$serviceType, $vendorOrFleet, $title, $description, $imageUrl, $menuOrFacilities]);
        $newId = $pdo->lastInsertId();
        logServiceActivity($pdo, $auth['name'] ?? '', 'SERVICES_CMS', 'CREATE', $newId, [], $data);
    }
    sendResponse(["status" => "success", "message" => "Konten penawaran berhasil disimpan."]);
}

elseif ($action === 'delete_offering' && $method === 'POST') {
    requireAuth(['ADMIN', 'STAFF']);
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? null;
    if (!$id) sendResponse(["status" => "error", "message" => "ID tidak valid."], 400);

    $stmt = $pdo->prepare("SELECT * FROM service_offerings WHERE id = ?");
    $stmt->execute([$id]);
    $old = $stmt->fetch();

    // Soft Delete
    $stmtDel = $pdo->prepare("UPDATE service_offerings SET status = 'DELETED' WHERE id = ?");
    $stmtDel->execute([$id]);
    logServiceActivity($pdo, $auth['name'] ?? '', 'SERVICES_CMS', 'DELETE', $id, $old, ['status' => 'DELETED']);
    sendResponse(["status" => "success", "message" => "Konten berhasil dihapus (soft delete tersimpan di log)."]);
}

elseif ($action === 'get_tariffs') {
    requireAuth(['ADMIN', 'STAFF']);
    try {
        $stmt = $pdo->query("SELECT * FROM service_tariffs");
        sendResponse(["status" => "success", "tariffs" => $stmt->fetchAll()]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

elseif ($action === 'save_tariff' && $method === 'POST') {
    requireAuth(['ADMIN']);
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
    requireAuth(['ADMIN', 'STAFF']);
    try {
        $stmt = $pdo->query("SELECT * FROM service_requests WHERE status != 'DELETED' ORDER BY id DESC");
        sendResponse(["status" => "success", "requests" => $stmt->fetchAll()]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

elseif ($action === 'submit_request' && $method === 'POST') {
    $ctx = serviceMemberContext($pdo, $auth);
    if (!$ctx['self']) {
        sendResponse(["status" => "error", "message" => "Data member tidak ditemukan untuk akun ini."], 404);
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $requestedMemberId = trim((string)($data['member_id'] ?? ''));
    // ID dari body hanya dipakai jika memang milik sendiri/anak aktif.
    $memberId = ($requestedMemberId !== '' && in_array($requestedMemberId, $ctx['allowed'], true))
        ? $requestedMemberId
        : $ctx['self'];

    $memberName = trim((string)($data['member_name'] ?? ''));
    $className = trim((string)($data['class_name'] ?? ''));
    $address = trim((string)($data['address'] ?? ''));
    $phone = trim((string)($data['phone'] ?? ''));
    $serviceType = strtoupper(trim((string)($data['service_type'] ?? '')));
    $subCategory = trim((string)($data['sub_category'] ?? ''));
    $vendorName = trim((string)($data['vendor_name'] ?? ''));
    $targetMonth = trim((string)($data['target_month'] ?? ''));

    if (!in_array($serviceType, ['CATERING', 'TRANSPORT'], true) || !$targetMonth || !$address) {
        sendResponse(["status" => "error", "message" => "Lengkapi data pengajuan layanan dengan benar."], 400);
    }
    if ($memberName === '' || $phone === '') {
        sendResponse(["status" => "error", "message" => "Nama siswa dan nomor wajib diisi."], 400);
    }

    $stmt = $pdo->prepare("INSERT INTO service_requests (member_id, member_name, class_name, address, phone, service_type, sub_category, vendor_name, target_month, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')");
    $stmt->execute([$memberId, $memberName, $className, $address, $phone, $serviceType, $subCategory, $vendorName, $targetMonth]);

    sendResponse(["status" => "success", "message" => "Pengajuan layanan berhasil dikirim dan menunggu verifikasi admin."]);
}

elseif ($action === 'approve_request' && $method === 'POST') {
    requireAuth(['ADMIN', 'STAFF']);
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

    $billCheck = $pdo->prepare("SELECT id FROM service_bills WHERE request_id = ? LIMIT 1");
    $billCheck->execute([$requestId]);
    if ($billCheck->fetch()) {
        sendResponse(["status" => "error", "message" => "Tagihan untuk pengajuan ini sudah diterbitkan."], 409);
    }

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

    logServiceActivity($pdo, $auth['name'] ?? '', 'SERVICES_APPROVE', 'APPROVE', $requestId, $req, ['status' => 'APPROVED', 'amount' => $finalAmount]);
    sendResponse(["status" => "success", "message" => "Pengajuan disetujui dan tagihan layanan berhasil diterbitkan."]);
}

elseif ($action === 'delete_request' && $method === 'POST') {
    requireAuth(['ADMIN', 'STAFF']);
    $data = json_decode(file_get_contents('php://input'), true);
    $requestId = $data['request_id'] ?? null;
    if (!$requestId) sendResponse(["status" => "error", "message" => "ID tidak valid."], 400);

    $stmt = $pdo->prepare("SELECT * FROM service_requests WHERE id = ?");
    $stmt->execute([$requestId]);
    $old = $stmt->fetch();

    // Soft delete
    $stmtDel = $pdo->prepare("UPDATE service_requests SET status = 'DELETED' WHERE id = ?");
    $stmtDel->execute([$requestId]);

    logServiceActivity($pdo, $auth['name'] ?? '', 'SERVICES_REQUEST', 'DELETE', $requestId, $old, ['status' => 'DELETED']);
    sendResponse(["status" => "success", "message" => "Pengajuan berhasil dihapus (soft delete tersimpan di log)."]);
}

elseif ($action === 'get_bills') {
    $requestedMemberId = trim((string)($_GET['member_id'] ?? ''));

    if ($isStaff) {
        if ($requestedMemberId !== '') {
            $ids = [$requestedMemberId];
        } else {
            try {
                $stmt = $pdo->query("SELECT * FROM service_bills ORDER BY id DESC");
                sendResponse(["status" => "success", "bills" => $stmt->fetchAll()]);
            } catch (Exception $e) {
                sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
            }
        }
    } else {
        $ctx = serviceMemberContext($pdo, $auth);
        if (!$ctx['self']) {
            sendResponse(["status" => "error", "message" => "Data member tidak ditemukan untuk akun ini."], 404);
        }
        if ($requestedMemberId !== '' && !in_array($requestedMemberId, $ctx['allowed'], true)) {
            sendResponse(["status" => "error", "message" => "Akses ditolak untuk tagihan tersebut."], 403);
        }
        $ids = ($requestedMemberId !== '') ? [$requestedMemberId] : $ctx['allowed'];
    }

    try {
        // Ambil nilai childMemberId ke PHP dulu, lalu bind sebagai string.
        // Ini menghindari error collation saat membandingkan dua tabel langsung.
        $stmt = $pdo->prepare("SELECT * FROM service_bills WHERE member_id IN (" . serviceInClause($ids) . ") ORDER BY id DESC");
        $stmt->execute(array_values($ids));
        sendResponse(["status" => "success", "bills" => $stmt->fetchAll()]);
    } catch (Exception $e) {
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}

elseif ($action === 'pay_bill' && $method === 'POST') {
    $ctx = $isStaff ? null : serviceMemberContext($pdo, $auth);
    if (!$isStaff && !$ctx['self']) {
        sendResponse(["status" => "error", "message" => "Data member tidak ditemukan untuk akun ini."], 404);
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $billId = $data['bill_id'] ?? null;
    $paymentMethod = strtoupper((string)($data['payment_method'] ?? 'DEPOSIT'));
    $paymentProof = trim((string)($data['payment_proof'] ?? ''));

    if (!$billId) sendResponse(["status" => "error", "message" => "ID Tagihan tidak valid."], 400);
    if (!in_array($paymentMethod, ['DEPOSIT', 'TRANSFER'], true)) {
        sendResponse(["status" => "error", "message" => "Metode pembayaran tidak dikenal."], 400);
    }

    $stmtB = $pdo->prepare("SELECT * FROM service_bills WHERE id = ?");
    $stmtB->execute([$billId]);
    $bill = $stmtB->fetch();
    if (!$bill) sendResponse(["status" => "error", "message" => "Tagihan tidak ditemukan."], 404);
    if (!$isStaff && !in_array($bill['member_id'], $ctx['allowed'], true)) {
        sendResponse(["status" => "error", "message" => "Akses ditolak untuk tagihan tersebut."], 403);
    }
    if (!in_array(strtoupper((string)$bill['status']), ['UNPAID', 'PENDING'], true)) {
        sendResponse(["status" => "error", "message" => "Tagihan ini sudah diproses."], 409);
    }

    $pdo->beginTransaction();
    try {
        $stmtFresh = $pdo->prepare("SELECT * FROM service_bills WHERE id = ? FOR UPDATE");
        $stmtFresh->execute([$billId]);
        $fresh = $stmtFresh->fetch();
        if (!$fresh || !in_array(strtoupper((string)$fresh['status']), ['UNPAID', 'PENDING'], true)) {
            $pdo->rollBack();
            sendResponse(["status" => "error", "message" => "Tagihan ini sudah diproses."], 409);
        }

        if ($paymentMethod === 'DEPOSIT') {
            $stmtM = $pdo->prepare("SELECT id, name, depositBalance FROM members WHERE id = ? FOR UPDATE");
            $stmtM->execute([$bill['member_id']]);
            $member = $stmtM->fetch();
            if (!$member) {
                $pdo->rollBack();
                sendResponse(["status" => "error", "message" => "Data member tidak ditemukan."], 404);
            }

            $amount = (float)$bill['amount'];
            $stmtUpD = $pdo->prepare("UPDATE members SET depositBalance = depositBalance - ? WHERE id = ? AND depositBalance >= ?");
            $stmtUpD->execute([$amount, $member['id'], $amount]);
            if ($stmtUpD->rowCount() < 1) {
                $pdo->rollBack();
                sendResponse(["status" => "error", "message" => "Saldo deposit member tidak mencukupi untuk melunasi tagihan ini."], 400);
            }

            $stmtLog = $pdo->prepare("INSERT INTO member_logs (memberId, type, amount, description, timestamp) VALUES (?, 'USAGE', ?, ?, NOW())");
            $stmtLog->execute([$member['id'], $amount, "[PELUNASAN LAYANAN: {$bill['service_type']} - {$bill['month']}]"]);

            $stmtUpB = $pdo->prepare("UPDATE service_bills SET status = 'PAID', payment_method = 'DEPOSIT', payment_proof = NULL, verified_by = ?, verified_at = NOW(), admin_notes = NULL WHERE id = ? AND status IN ('UNPAID','PENDING')");
            $stmtUpB->execute([$auth['name'] ?? ($member['name'] ?? 'MEMBER'), $billId]);
            if ($stmtUpB->rowCount() < 1) {
                $pdo->rollBack();
                sendResponse(["status" => "error", "message" => "Tagihan ini sudah diproses."], 409);
            }

            $pdo->commit();
            sendResponse(["status" => "success", "message" => "Tagihan berhasil dilunasi menggunakan Saldo Deposit."]);
        }

        if ($paymentProof === '') {
            $pdo->rollBack();
            sendResponse(["status" => "error", "message" => "Keterangan / referensi transfer wajib diisi."], 400);
        }
        $paymentProof = mb_substr($paymentProof, 0, 255);

        $stmtUpB = $pdo->prepare("UPDATE service_bills SET status = 'PENDING', payment_method = 'TRANSFER', payment_proof = ?, verified_by = NULL, verified_at = NULL, admin_notes = NULL WHERE id = ? AND status IN ('UNPAID','PENDING')");
        $stmtUpB->execute([$paymentProof, $billId]);
        if ($stmtUpB->rowCount() < 1) {
            $pdo->rollBack();
            sendResponse(["status" => "error", "message" => "Tagihan ini sudah diproses."], 409);
        }

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Konfirmasi pembayaran berhasil dikirim dan menunggu verifikasi staff."]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendResponse(["status" => "error", "message" => "Gagal memproses pembayaran: " . $e->getMessage()], 500);
    }
}

elseif ($action === 'verify_bill' && $method === 'POST') {
    requireAuth(['ADMIN', 'STAFF']);
    $data = json_decode(file_get_contents('php://input'), true);
    $billId = $data['bill_id'] ?? null;
    $decision = strtoupper(trim((string)($data['decision'] ?? '')));
    $notes = trim((string)($data['admin_notes'] ?? ''));

    if (!$billId) sendResponse(["status" => "error", "message" => "ID Tagihan tidak valid."], 400);
    if (!in_array($decision, ['APPROVE', 'REJECT'], true)) {
        sendResponse(["status" => "error", "message" => "Keputusan tidak dikenal."], 400);
    }

    $stmtB = $pdo->prepare("SELECT * FROM service_bills WHERE id = ?");
    $stmtB->execute([$billId]);
    $bill = $stmtB->fetch();
    if (!$bill) sendResponse(["status" => "error", "message" => "Tagihan tidak ditemukan."], 404);
    if (strtoupper((string)$bill['status']) !== 'PENDING') {
        sendResponse(["status" => "error", "message" => "Hanya tagihan berstatus PENDING yang bisa diverifikasi."], 409);
    }

    if ($decision === 'APPROVE') {
        $newStatus = 'PAID';
        $message = "Pembayaran tagihan disetujui.";
    } else {
        $newStatus = 'UNPAID';
        $message = "Pembayaran ditolak. Tagihan dikembalikan ke status belum dibayar.";
    }

    $stmtUp = $pdo->prepare("UPDATE service_bills SET status = ?, verified_by = ?, verified_at = NOW(), admin_notes = ?, payment_method = CASE WHEN ? = 'UNPAID' THEN NULL ELSE payment_method END, payment_proof = CASE WHEN ? = 'UNPAID' THEN NULL ELSE payment_proof END WHERE id = ? AND status = 'PENDING'");
    $stmtUp->execute([$newStatus, $auth['name'] ?? '', $notes, $newStatus, $newStatus, $billId]);
    if ($stmtUp->rowCount() < 1) {
        sendResponse(["status" => "error", "message" => "Tagihan ini sudah diverifikasi atau statusnya berubah."], 409);
    }

    logServiceActivity($pdo, $auth['name'] ?? '', 'SERVICES_BILL', $decision, $billId, $bill, ['status' => $newStatus, 'admin_notes' => $notes]);
    sendResponse(["status" => "success", "message" => $message]);
}

else {
    sendResponse(["status" => "error", "message" => "Aksi tidak dikenal."], 400);
}
