<?php
require_once 'db.php';
$auth = requireAuth(['MEMBER']);
$data = json_decode(file_get_contents('php://input'), true) ?: [];
$childId = trim((string)($data['childMemberId'] ?? ''));
$requestId = trim((string)($data['requestId'] ?? ''));
$amountRaw = trim((string)($data['amount'] ?? ''));
$direction = trim((string)($data['direction'] ?? 'to_child')); // 'to_child' or 'to_parent'

if ($childId === '' || !preg_match('/^[A-Za-z0-9_-]{1,50}$/', $requestId) || !preg_match('/^[0-9]{1,12}(?:\.[0-9]{1,2})?$/', $amountRaw) || (float)$amountRaw <= 0) {
    sendResponse(["status" => "error", "message" => "Tujuan, nomor permintaan, atau nominal transfer tidak valid."], 400);
}
$amount = number_format((float)$amountRaw, 2, '.', '');

try {
    $parentStmt = $pdo->prepare("SELECT id, name, status, memberType FROM members WHERE id = ? LIMIT 1");
    $parentStmt->execute([$auth['uid'] ?? '']);
    $parent = $parentStmt->fetch();
    if (!$parent && !empty($auth['email'])) {
        $parentStmt = $pdo->prepare("SELECT id, name, status, memberType FROM members WHERE email = ? LIMIT 1");
        $parentStmt->execute([$auth['email']]);
        $parent = $parentStmt->fetch();
    }
    if (!$parent || strtoupper((string)$parent['status']) !== 'APPROVED' || ($parent['memberType'] ?? 'ADULT') === 'STUDENT') {
        throw new Exception("Profil orang tua tidak aktif.", 403);
    }
    if ($parent['id'] === $childId) throw new Exception("Saldo tidak dapat ditransfer ke profil yang sama.", 400);

    $pdo->beginTransaction();
    $existingStmt = $pdo->prepare("SELECT fromMemberId, toMemberId, amount FROM deposit_transfers WHERE id = ? LIMIT 1 FOR UPDATE");
    $existingStmt->execute([$requestId]);
    $existing = $existingStmt->fetch();
    if ($existing) {
        if ($existing['fromMemberId'] !== ($direction === 'to_child' ? $parent['id'] : $childId) || 
            $existing['toMemberId'] !== ($direction === 'to_child' ? $childId : $parent['id']) || 
            (float)$existing['amount'] !== (float)$amount) {
            throw new Exception("Nomor permintaan transfer sudah digunakan untuk data lain.", 409);
        }
        $balancesStmt = $pdo->prepare("SELECT id, depositBalance FROM members WHERE id IN (?, ?)");
        $balancesStmt->execute([$parent['id'], $childId]);
        $balances = [];
        foreach ($balancesStmt->fetchAll() as $balance) $balances[$balance['id']] = (float)$balance['depositBalance'];
        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Transfer ini sudah berhasil diproses.", "requestId" => $requestId, "parentBalance" => $balances[$parent['id']] ?? 0, "childBalance" => $balances[$childId] ?? 0]);
    }

    $memberIds = [$parent['id'], $childId];
    sort($memberIds, SORT_STRING);
    $memberStmt = $pdo->prepare("SELECT id, name, status, memberType, depositBalance FROM members WHERE id IN (?, ?) ORDER BY id FOR UPDATE");
    $memberStmt->execute($memberIds);
    $lockedMembers = [];
    foreach ($memberStmt->fetchAll() as $member) $lockedMembers[$member['id']] = $member;
    if (!isset($lockedMembers[$childId]) || ($lockedMembers[$childId]['memberType'] ?? 'ADULT') !== 'STUDENT' || strtoupper((string)$lockedMembers[$childId]['status']) !== 'APPROVED') {
        throw new Exception("Profil anak tidak ditemukan atau tidak aktif.", 404);
    }

    $guardianStmt = $pdo->prepare("SELECT id FROM member_guardians WHERE parentMemberId = ? AND childMemberId = ? AND status = 'ACTIVE' LIMIT 1");
    $guardianStmt->execute([$parent['id'], $childId]);
    if (!$guardianStmt->fetch()) throw new Exception("Anda tidak memiliki akses transfer ke siswa ini.", 403);

    if ($direction === 'to_parent') {
        // Tarik saldo dari anak ke orang tua
        $debitStmt = $pdo->prepare("UPDATE members SET depositBalance = depositBalance - ? WHERE id = ? AND depositBalance >= ?");
        $debitStmt->execute([$amount, $childId, $amount]);
        if ($debitStmt->rowCount() !== 1) throw new Exception("Saldo deposit anak tidak mencukupi untuk ditarik.", 409);

        $creditStmt = $pdo->prepare("UPDATE members SET depositBalance = depositBalance + ? WHERE id = ?");
        $creditStmt->execute([$amount, $parent['id']]);

        $fromId = $childId;
        $toId = $parent['id'];
        $logOutType = 'TRANSFER_OUT';
        $logInType = 'TRANSFER_IN';
        $outNotes = 'Penarikan saldo dari ' . $lockedMembers[$childId]['name'];
        $inNotes = 'Penerimaan penarikan saldo oleh ' . $parent['name'];
    } else {
        // Transfer dari orang tua ke anak
        $debitStmt = $pdo->prepare("UPDATE members SET depositBalance = depositBalance - ? WHERE id = ? AND depositBalance >= ?");
        $debitStmt->execute([$amount, $parent['id'], $amount]);
        if ($debitStmt->rowCount() !== 1) throw new Exception("Saldo deposit orang tua tidak mencukupi.", 409);

        $creditStmt = $pdo->prepare("UPDATE members SET depositBalance = depositBalance + ? WHERE id = ?");
        $creditStmt->execute([$amount, $childId]);

        $fromId = $parent['id'];
        $toId = $childId;
        $logOutType = 'TRANSFER_OUT';
        $logInType = 'TRANSFER_IN';
        $outNotes = 'Transfer saldo ke ' . $lockedMembers[$childId]['name'];
        $inNotes = 'Transfer saldo dari ' . $parent['name'];
    }

    $transferStmt = $pdo->prepare("INSERT INTO deposit_transfers (id, fromMemberId, toMemberId, amount) VALUES (?, ?, ?, ?)");
    $transferStmt->execute([$requestId, $fromId, $toId, $amount]);
    
    $logStmt = $pdo->prepare("INSERT INTO member_logs (memberId, type, amount, transferId, staffId, status, notes, timestamp) VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, NOW())");
    $logStmt->execute([$fromId, $logOutType, $amount, $requestId, $parent['name'], $outNotes]);
    $logStmt->execute([$toId, $logInType, $amount, $requestId, $parent['name'], $inNotes]);

    $balancesStmt = $pdo->prepare("SELECT id, depositBalance FROM members WHERE id IN (?, ?)");
    $balancesStmt->execute([$parent['id'], $childId]);
    $balances = [];
    foreach ($balancesStmt->fetchAll() as $balance) $balances[$balance['id']] = (float)$balance['depositBalance'];
    $pdo->commit();
    sendResponse(["status" => "success", "message" => "Transfer/penarikan saldo berhasil.", "requestId" => $requestId, "parentBalance" => $balances[$parent['id']] ?? 0, "childBalance" => $balances[$childId] ?? 0]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $statusCode = in_array((int)$e->getCode(), [400, 403, 404, 409], true) ? (int)$e->getCode() : 500;
    sendResponse(["status" => "error", "message" => $e->getMessage()], $statusCode);
}
