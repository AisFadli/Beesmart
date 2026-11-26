<?php
require_once 'db.php';
require_once 'upload_helper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(["status" => "error", "message" => "Method not allowed"], 405);
}

if (!isset($_FILES['file'])) {
    sendResponse(["status" => "error", "message" => "Tidak ada file yang diunggah."], 400);
}

$validated = validateUpload($_FILES['file']);
$url = storeUpload($_FILES['file'], $validated['extension']);

sendResponse(["status" => "success", "url" => $url]);
