<?php
require_once 'db.php';
require_once 'app_url.php';

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$action = strtolower(trim((string)($data['action'] ?? '')));

if ($action === 'activate') {
    $token = trim((string)($data['token'] ?? ''));
    $password = $data['password'] ?? '';
    $confirmPassword = $data['confirmPassword'] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/i', $token) || !is_string($password) || strlen($password) < 8 || $password !== $confirmPassword) {
        sendResponse(["status" => "error", "message" => "Token tidak valid atau password minimal 8 karakter dan konfirmasi tidak cocok."], 400);
    }

    try {
        $pdo->beginTransaction();
        $tokenStmt = $pdo->prepare("SELECT i.id, i.memberId, i.email, m.name, m.status AS memberStatus FROM member_invitations i JOIN members m ON m.id = i.memberId WHERE i.tokenHash = ? AND i.usedAt IS NULL AND i.expiresAt > NOW() LIMIT 1 FOR UPDATE");
        $tokenStmt->execute([hash('sha256', $token)]);
        $invitation = $tokenStmt->fetch();
        if (!$invitation) throw new Exception("Undangan tidak valid, sudah digunakan, atau kedaluwarsa.", 400);
        if (strtoupper((string)$invitation['memberStatus']) !== 'APPROVED') throw new Exception("Profil orang tua belum aktif. Hubungi admin sekolah.", 403);

        $userStmt = $pdo->prepare("SELECT id, role, status FROM users WHERE email = ? OR id = ? LIMIT 2 FOR UPDATE");
        $userStmt->execute([$invitation['email'], $invitation['memberId']]);
        $users = $userStmt->fetchAll();
        if (count($users) > 1) throw new Exception("Akun parent perlu diperiksa admin sebelum diaktifkan.", 409);

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        if ($users) {
            $user = $users[0];
            if (strtoupper((string)$user['role']) !== 'MEMBER' || strtoupper((string)$user['status']) === 'ACTIVE') {
                throw new Exception("Akun tidak memenuhi status aktivasi.", 409);
            }
            $activateUser = $pdo->prepare("UPDATE users SET password = ?, status = 'ACTIVE', tokenVersion = tokenVersion + 1 WHERE id = ?");
            $activateUser->execute([$passwordHash, $user['id']]);
        } else {
            $createUser = $pdo->prepare("INSERT INTO users (id, username, email, password, name, role, status, tokenVersion) VALUES (?, NULL, ?, ?, ?, 'MEMBER', 'ACTIVE', 1)");
            $createUser->execute([$invitation['memberId'], $invitation['email'], $passwordHash, $invitation['name']]);
        }

        $pdo->prepare("UPDATE members SET password = ? WHERE id = ?")->execute([$passwordHash, $invitation['memberId']]);
        $pdo->prepare("UPDATE member_invitations SET usedAt = NOW() WHERE memberId = ? AND usedAt IS NULL")->execute([$invitation['memberId']]);
        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Akun berhasil diaktifkan. Silakan masuk menggunakan email dan password baru."]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $statusCode = in_array((int)$e->getCode(), [400, 403, 409], true) ? (int)$e->getCode() : 500;
        sendResponse(["status" => "error", "message" => $e->getMessage()], $statusCode);
    }
}

$auth = requireAuth(['ADMIN']);
if ($action !== 'invite') sendResponse(["status" => "error", "message" => "Aksi tidak dikenal."], 400);
$memberIds = $data['memberIds'] ?? [];
if (!is_array($memberIds) || count($memberIds) < 1 || count($memberIds) > 25) {
    sendResponse(["status" => "error", "message" => "Undangan harus berisi 1 sampai 25 orang tua per pengiriman."], 400);
}

$mailConfigured = file_exists(__DIR__ . '/mail_config.php');
if ($mailConfigured) require_once __DIR__ . '/mail_sender.php';
$invitations = [];
try {
    $pdo->beginTransaction();
    foreach (array_values(array_unique(array_map('strval', $memberIds))) as $memberId) {
        $memberStmt = $pdo->prepare("SELECT id, name, email, memberType, status FROM members WHERE id = ? LIMIT 1 FOR UPDATE");
        $memberStmt->execute([$memberId]);
        $member = $memberStmt->fetch();
        if (!$member || ($member['memberType'] ?? 'ADULT') === 'STUDENT' || strtoupper((string)$member['status']) !== 'APPROVED' || !filter_var($member['email'] ?? '', FILTER_VALIDATE_EMAIL)) {
            throw new Exception("Profil parent tidak ditemukan atau email belum valid.", 400);
        }

        $userStmt = $pdo->prepare("SELECT id, role, status FROM users WHERE email = ? LIMIT 1 FOR UPDATE");
        $userStmt->execute([$member['email']]);
        $user = $userStmt->fetch();
        if ($user && strtoupper((string)$user['role']) !== 'MEMBER') throw new Exception("Email {$member['email']} sudah digunakan akun non-member.", 409);
        if ($user && strtoupper((string)$user['status']) === 'ACTIVE') continue;
        if (!$user) {
            $temporaryHash = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
            $createUser = $pdo->prepare("INSERT INTO users (id, username, email, password, name, role, status, tokenVersion) VALUES (?, NULL, ?, ?, ?, 'MEMBER', 'INVITED', 0)");
            $createUser->execute([$member['id'], $member['email'], $temporaryHash, $member['name']]);
        }

        $token = bin2hex(random_bytes(32));
        $pdo->prepare("DELETE FROM member_invitations WHERE memberId = ? AND usedAt IS NULL")->execute([$member['id']]);
        $invitationStmt = $pdo->prepare("INSERT INTO member_invitations (memberId, email, tokenHash, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 48 HOUR))");
        $invitationStmt->execute([$member['id'], $member['email'], hash('sha256', $token)]);
        $invitations[] = ['id' => $member['id'], 'name' => $member['name'], 'email' => $member['email'], 'token' => $token];
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $statusCode = in_array((int)$e->getCode(), [400, 409], true) ? (int)$e->getCode() : 500;
    sendResponse(["status" => "error", "message" => $e->getMessage()], $statusCode);
}

$sent = [];
$failed = [];
$baseUrl = getAppBaseUrl();
foreach ($invitations as $invitation) {
    if (!$mailConfigured) {
        $failed[] = $invitation['id'];
        continue;
    }
    $link = $baseUrl . '/?activation_token=' . rawurlencode($invitation['token']);
    $message = "Halo {$invitation['name']},\n\n"
        . "Akun orang tua BeeSmart Anda sudah disiapkan. Aktivasi akun dan buat password melalui tautan berikut (berlaku 48 jam dan hanya dapat digunakan sekali):\n\n"
        . $link . "\n\nJika Anda tidak mengenal sekolah atau siswa yang terkait, abaikan email ini dan hubungi admin.\n\nBeeSmart";
    try {
        if (sendNoReplyEmail($invitation['email'], 'Aktivasi Akun Orang Tua BeeSmart', $message)) $sent[] = $invitation['id'];
        else $failed[] = $invitation['id'];
    } catch (Throwable $e) {
        error_log('member_activation: gagal mengirim undangan member ' . $invitation['id']);
        $failed[] = $invitation['id'];
    }
}

sendResponse([
    "status" => "success",
    "message" => count($sent) . " undangan terkirim; " . count($failed) . " perlu dikirim ulang.",
    "sent" => $sent,
    "failed" => $failed,
    "alreadyActive" => count(array_unique(array_map('strval', $memberIds))) - count($invitations)
]);