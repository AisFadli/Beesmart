<?php
require_once 'db.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_FILES['file'])) {
        sendResponse(["status" => "error", "message" => "Tidak ada file yang diunggah."], 400);
    }

    $file = $_FILES['file'];
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid('proof_') . '.' . $ext;
    $uploadDir = '../uploads/';
    
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    if (move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
        sendResponse(["status" => "success", "url" => 'uploads/' . $filename]);
    } else {
        sendResponse(["status" => "error", "message" => "Gagal menyimpan file."], 500);
    }
}
