<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN']);

function generateMemberImportId($prefix) {
    return $prefix . '-' . bin2hex(random_bytes(8));
}

$data = json_decode(file_get_contents('php://input'), true);
$rows = $data['rows'] ?? null;
if (!is_array($rows) || count($rows) < 1 || count($rows) > 1000) {
    sendResponse(["status" => "error", "message" => "File harus berisi 1 sampai 1000 baris siswa."], 400);
}

$normalizedRows = [];
$studentKeys = [];
$parentNames = [];
foreach ($rows as $index => $row) {
    if (!is_array($row)) {
        sendResponse(["status" => "error", "message" => "Format baris " . ($index + 2) . " tidak valid."], 400);
    }
    $studentName = trim((string)($row['studentName'] ?? ''));
    $nis = trim((string)($row['nis'] ?? ''));
    $nisn = trim((string)($row['nisn'] ?? ''));
    $className = trim((string)($row['className'] ?? ''));
    $parentName = trim((string)($row['parentName'] ?? ''));
    $parentEmail = strtolower(trim((string)($row['parentEmail'] ?? '')));
    $parentWhatsapp = trim((string)($row['parentWhatsapp'] ?? ''));
    $relationship = strtoupper(trim((string)($row['relationship'] ?? 'PARENT')));
    $line = $index + 2;

    if ($studentName === '' || $parentName === '' || !filter_var($parentEmail, FILTER_VALIDATE_EMAIL) || ($nis === '' && $nisn === '')) {
        sendResponse(["status" => "error", "message" => "Baris {$line}: nama siswa, NIS atau NISN, nama orang tua, dan email orang tua wajib valid."], 400);
    }
    foreach ([$nis, $nisn] as $identifier) {
        if ($identifier !== '' && (strlen($identifier) > 50 || !preg_match('/^[A-Za-z0-9_-]+$/', $identifier))) {
            sendResponse(["status" => "error", "message" => "Baris {$line}: NIS/NISN hanya boleh berisi huruf, angka, tanda hubung, atau garis bawah (maksimal 50 karakter)."], 400);
        }
    }
    if (strlen($studentName) > 100 || strlen($parentName) > 100 || strlen($className) > 100 || strlen($parentWhatsapp) > 20 || strlen($parentEmail) > 100) {
        sendResponse(["status" => "error", "message" => "Baris {$line}: salah satu data melebihi panjang maksimum."], 400);
    }
    if (!in_array($relationship, ['PARENT', 'MOTHER', 'FATHER', 'GUARDIAN'], true)) $relationship = 'PARENT';

    $studentKey = $nisn !== '' ? 'NISN:' . strtoupper($nisn) : 'NIS:' . strtoupper($nis);
    if (isset($studentKeys[$studentKey]) && strcasecmp($studentKeys[$studentKey], $studentName) !== 0) {
        sendResponse(["status" => "error", "message" => "Baris {$line}: identitas siswa yang sama memiliki nama berbeda di file."], 400);
    }
    $studentKeys[$studentKey] = $studentName;
    foreach ([['NIS', $nis], ['NISN', $nisn]] as [$identifierType, $identifier]) {
        if ($identifier === '') continue;
        $identifierKey = $identifierType . ':' . strtoupper($identifier);
        if (isset($studentKeys[$identifierKey]) && strcasecmp($studentKeys[$identifierKey], $studentName) !== 0) {
            sendResponse(["status" => "error", "message" => "Baris {$line}: NIS/NISN yang sama memiliki nama berbeda di file."], 400);
        }
        $studentKeys[$identifierKey] = $studentName;
    }
    if (isset($parentNames[$parentEmail]) && strcasecmp($parentNames[$parentEmail], $parentName) !== 0) {
        sendResponse(["status" => "error", "message" => "Baris {$line}: email orang tua yang sama memiliki nama berbeda di file."], 400);
    }
    $parentNames[$parentEmail] = $parentName;
    $normalizedRows[] = compact('studentName', 'nis', 'nisn', 'className', 'parentName', 'parentEmail', 'parentWhatsapp', 'relationship');
}

try {
    $pdo->beginTransaction();
    $createdParents = [];
    $inviteRequired = [];
    $createdStudentIds = [];
    $updatedStudentIds = [];
    $newRelationships = 0;

    foreach ($normalizedRows as $row) {
        $parentStmt = $pdo->prepare("SELECT id, name, memberType, status FROM members WHERE email = ? LIMIT 1 FOR UPDATE");
        $parentStmt->execute([$row['parentEmail']]);
        $parent = $parentStmt->fetch();
        if ($parent && ($parent['memberType'] ?? 'ADULT') === 'STUDENT') {
            throw new Exception("Email orang tua {$row['parentEmail']} sudah digunakan sebagai profil siswa.", 409);
        }
        if ($parent && strtoupper((string)$parent['status']) !== 'APPROVED') {
            throw new Exception("Profil orang tua {$row['parentEmail']} belum aktif atau sedang ditangguhkan.", 409);
        }

        if (!$parent) {
            $userStmt = $pdo->prepare("SELECT id, role FROM users WHERE email = ? LIMIT 1 FOR UPDATE");
            $userStmt->execute([$row['parentEmail']]);
            $existingUser = $userStmt->fetch();
            if ($existingUser && strtoupper((string)$existingUser['role']) !== 'MEMBER') {
                throw new Exception("Email {$row['parentEmail']} sudah digunakan akun staf/admin. Periksa data wali sebelum impor.", 409);
            }

            $parentId = generateMemberImportId('PAR');
            $parentBarcode = 'MBR-' . strtoupper(bin2hex(random_bytes(5)));
            $insertParent = $pdo->prepare("INSERT INTO members (id, barcode, name, email, address, password, whatsapp, depositBalance, registrationDate, status, memberType) VALUES (?, ?, ?, ?, NULL, NULL, ?, 0, NOW(), 'APPROVED', 'ADULT')");
            $insertParent->execute([$parentId, $parentBarcode, $row['parentName'], $row['parentEmail'], $row['parentWhatsapp'] ?: null]);
            $parent = ['id' => $parentId, 'name' => $row['parentName'], 'memberType' => 'ADULT', 'status' => 'APPROVED'];
            $createdParents[$parentId] = true;
        }

        $studentByNisn = null;
        $studentByNis = null;
        if ($row['nisn'] !== '') {
            $studentStmt = $pdo->prepare("SELECT id, name, memberType, barcode FROM members WHERE nisn = ? LIMIT 2 FOR UPDATE");
            $studentStmt->execute([$row['nisn']]);
            $matches = $studentStmt->fetchAll();
            if (count($matches) > 1) throw new Exception("NISN {$row['nisn']} terduplikasi di database. Perbaiki data sebelum impor.", 409);
            $studentByNisn = $matches[0] ?? null;
        }
        if ($row['nis'] !== '') {
            $studentStmt = $pdo->prepare("SELECT id, name, memberType, barcode FROM members WHERE nis = ? LIMIT 2 FOR UPDATE");
            $studentStmt->execute([$row['nis']]);
            $matches = $studentStmt->fetchAll();
            if (count($matches) > 1) throw new Exception("NIS {$row['nis']} terduplikasi di database. Perbaiki data sebelum impor.", 409);
            $studentByNis = $matches[0] ?? null;
        }
        if ($studentByNisn && $studentByNis && $studentByNisn['id'] !== $studentByNis['id']) {
            throw new Exception("NIS dan NISN pada siswa {$row['studentName']} mengarah ke profil berbeda.", 409);
        }
        $student = $studentByNisn ?: $studentByNis;
        $studentBarcode = $row['nisn'] !== '' ? $row['nisn'] : $row['nis'];

        $productCheck = $pdo->prepare("SELECT id FROM products WHERE barcode = ? OR sku = ? OR id = ? LIMIT 1");
        $productCheck->execute([$studentBarcode, $studentBarcode, $studentBarcode]);
        if ($productCheck->fetch()) throw new Exception("Barcode siswa {$studentBarcode} bentrok dengan produk.", 409);
        $barcodeCheck = $pdo->prepare("SELECT id FROM members WHERE barcode = ? AND id != ? LIMIT 1");
        $barcodeCheck->execute([$studentBarcode, $student['id'] ?? '']);
        if ($barcodeCheck->fetch()) throw new Exception("Barcode siswa {$studentBarcode} sudah dipakai member lain.", 409);

        if ($student) {
            if (($student['memberType'] ?? 'ADULT') !== 'STUDENT') {
                throw new Exception("NIS/NISN siswa {$row['studentName']} cocok dengan profil non-siswa.", 409);
            }
            $updateStudent = $pdo->prepare("UPDATE members SET name = ?, barcode = ?, nis = ?, nisn = ?, className = ?, memberType = 'STUDENT' WHERE id = ?");
            $updateStudent->execute([$row['studentName'], $studentBarcode, $row['nis'] ?: null, $row['nisn'] ?: null, $row['className'] ?: null, $student['id']]);
            $studentId = $student['id'];
            $updatedStudentIds[$studentId] = true;
        } else {
            $studentId = generateMemberImportId('STD');
            $insertStudent = $pdo->prepare("INSERT INTO members (id, barcode, name, email, address, password, whatsapp, depositBalance, registrationDate, status, memberType, nis, nisn, className) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 0, NOW(), 'APPROVED', 'STUDENT', ?, ?, ?)");
            $insertStudent->execute([$studentId, $studentBarcode, $row['studentName'], $row['nis'] ?: null, $row['nisn'] ?: null, $row['className'] ?: null]);
            $createdStudentIds[$studentId] = true;
        }

        if ($parent['id'] === $studentId) throw new Exception("Profil orang tua dan siswa tidak boleh sama.", 409);
        $linkCheck = $pdo->prepare("SELECT id FROM member_guardians WHERE parentMemberId = ? AND childMemberId = ? LIMIT 1");
        $linkCheck->execute([$parent['id'], $studentId]);
        if (!$linkCheck->fetch()) $newRelationships++;
        $linkStmt = $pdo->prepare("INSERT INTO member_guardians (parentMemberId, childMemberId, relationship, status, createdBy) VALUES (?, ?, ?, 'ACTIVE', ?) ON DUPLICATE KEY UPDATE relationship = VALUES(relationship), status = 'ACTIVE'");
        $linkStmt->execute([$parent['id'], $studentId, $row['relationship'], $auth['uid'] ?? null]);

        $userStmt = $pdo->prepare("SELECT id, role, status, password FROM users WHERE email = ? LIMIT 1 FOR UPDATE");
        $userStmt->execute([$row['parentEmail']]);
        $parentUser = $userStmt->fetch();

        // Ambil password dari tabel members jika ada
        $memberPassStmt = $pdo->prepare("SELECT password FROM members WHERE id = ? LIMIT 1");
        $memberPassStmt->execute([$parent['id']]);
        $memberPassRow = $memberPassStmt->fetch();
        $existingPassword = $memberPassRow['password'] ?? ($parentUser['password'] ?? null);

        if (!$parentUser) {
            $passwordToUse = $existingPassword ?: password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
            $userStatus = $existingPassword ? 'ACTIVE' : 'INVITED';
            $createUser = $pdo->prepare("INSERT INTO users (id, username, email, password, name, role, status, tokenVersion) VALUES (?, NULL, ?, ?, ?, 'MEMBER', ?, 0)");
            $createUser->execute([$parent['id'], $row['parentEmail'], $passwordToUse, $parent['name'], $userStatus]);
            if (!$existingPassword) {
                $inviteRequired[$parent['id']] = true;
            }
        } elseif (strtoupper((string)$parentUser['role']) !== 'MEMBER') {
            throw new Exception("Email {$row['parentEmail']} terhubung ke akun non-member.", 409);
        } else {
            // Pastikan password di users tersinkron dengan members jika members memiliki password asli
            if ($existingPassword && $existingPassword !== $parentUser['password']) {
                $updateUserPass = $pdo->prepare("UPDATE users SET password = ? WHERE email = ?");
                $updateUserPass->execute([$existingPassword, $row['parentEmail']]);
            }
        }
    }

    $pdo->commit();
    sendResponse([
        "status" => "success",
        "message" => "Impor siswa dan hubungan wali berhasil.",
        "createdStudents" => count($createdStudentIds),
        "updatedStudents" => count($updatedStudentIds),
        "createdParents" => count($createdParents),
        "linkedRelationships" => $newRelationships,
        "inviteRequired" => array_keys($inviteRequired)
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $statusCode = in_array((int)$e->getCode(), [400, 409], true) ? (int)$e->getCode() : 500;
    sendResponse(["status" => "error", "message" => $e->getMessage()], $statusCode);
}