SELECT id, username, email, image_url, created_at
FROM users
ORDER BY id DESC;

SELECT COUNT(*) AS total_usuarios
FROM users;

SELECT id, user_id, client_name, document_type, total, pdf_url, created_at
FROM documents
ORDER BY id DESC;

SELECT d.id,
       u.username,
       u.email,
       d.client_name,
       d.document_type,
       d.total,
       d.pdf_url,
       d.created_at
FROM documents d
INNER JOIN users u ON u.id = d.user_id
ORDER BY d.id DESC;

SELECT u.id,
       u.username,
       u.email,
       COUNT(d.id) AS cantidad_documentos
FROM users u
LEFT JOIN documents d ON d.user_id = u.id
GROUP BY u.id, u.username, u.email
ORDER BY u.id DESC;
