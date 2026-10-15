
<?php
require_once 'db.php';
$auth = requireAuth(['ADMIN', 'STAFF']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $memberId = $data['memberId'];

    try {
        $pdo->beginTransaction();

        // 1. Ambil data member
        $stmt = $pdo->prepare("SELECT * FROM members WHERE id = ? LIMIT 1");
        $stmt->execute([$memberId]);
        $member = $stmt->fetch();

        if (!$member) {
            throw new Exception("Member tidak ditemukan.");
        }

        // 2. Update status member
        $upd = $pdo->prepare("UPDATE members SET status = 'APPROVED' WHERE id = ?");
        $upd->execute([$memberId]);

        // 3. Masukkan ke tabel users agar bisa login
        $ins = $pdo->prepare("INSERT INTO users (id, email, name, role, password, status) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), role = VALUES(role), password = VALUES(password), status = VALUES(status), tokenVersion = tokenVersion + 1");
        $ins->execute([
            $memberId,
            $member['email'],
            $member['name'],
            'MEMBER',
            $member['password'] ?: password_hash('123456', PASSWORD_BCRYPT),
            'ACTIVE'
        ]);

        logActivity($pdo, $auth['name'] ?? 'System', 'Membership', 'APPROVE_MEMBER', $memberId, $member, ['status' => 'APPROVED']);

        $pdo->commit();
        sendResponse(["status" => "success", "message" => "Member disetujui dan akun login telah aktif."]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendResponse(["status" => "error", "message" => $e->getMessage()], 500);
    }
}
