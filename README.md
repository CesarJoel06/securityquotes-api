# SecurityQuotes API Remaster - VPS 62.169.22.80

Backend en Node.js + Express + SQLite + PDFKit para la app **SecurityQuotes**.

## Estado de esta versión

Esta versión corrige y mejora lo siguiente:

- generación de PDF reforzada
- la API ya no falla con HTTP 400 por enviar `services` o `materials` como texto; ahora acepta texto o arreglo
- URLs públicas de imágenes y PDFs consistentes con:
  - `PUBLIC_BASE_URL=http://62.169.22.80:3000`
- endpoint administrativo para listar usuarios
- endpoint administrativo para listar documentos de un usuario
- endpoint administrativo para generar PDF desde Postman para cualquier usuario
- endpoint para listar documentos del usuario autenticado

---

## Variables configuradas para este VPS

Archivo `.env` incluido en esta carpeta:

```env
PORT=3000
JWT_SECRET=cesar
ADMIN_API_KEY=kjkszpj
PUBLIC_BASE_URL=http://62.169.22.80:3000
```

### Qué significa cada variable

- `PORT`: puerto interno del servicio
- `JWT_SECRET`: clave con la que la API firma y valida los tokens JWT del login
- `ADMIN_API_KEY`: clave administrativa para consultar usuarios o generar documentos desde Postman sin depender del login del usuario final
- `PUBLIC_BASE_URL`: URL pública del servidor para construir enlaces de imágenes y PDFs

---

## Despliegue en el VPS

Ruta del proyecto en el VPS:

```bash
/opt/apps/securityquotes-api
```

### Actualizar código desde GitHub

```bash
cd /opt/apps/securityquotes-api
cp .env .env.backup
git pull origin main
```

Si tu rama fuera `master`:

```bash
git pull origin master
```

### Reiniciar el servicio

```bash
cd /opt/apps/securityquotes-api
docker compose down
docker compose up -d --build
docker compose ps
docker logs --tail=100 securityquotes-api-remaster
```

### Verificar salud de la API

```bash
curl http://127.0.0.1:3000/api/health
curl http://62.169.22.80:3000/api/health
```

---

## Docker Compose

```bash
docker compose up -d --build
```

El contenedor publicado es:

- `securityquotes-api-remaster`

Persistencia local:

- `./data` -> base de datos SQLite
- `./uploads` -> imágenes subidas
- `./generated` -> PDFs generados

---

## Endpoints principales

### 1) Registro

**POST** `http://62.169.22.80:3000/api/auth/register`

Tipo: `form-data`

Campos:
- `username`
- `email`
- `password`
- `image` (opcional)

### 2) Login

**POST** `http://62.169.22.80:3000/api/auth/login`

Body JSON:

```json
{
  "email": "correo@ejemplo.com",
  "password": "123456"
}
```

Respuesta esperada:

```json
{
  "token": "JWT_AQUI",
  "user": {
    "id": 1,
    "username": "César",
    "email": "correo@ejemplo.com",
    "imageUrl": "http://62.169.22.80:3000/uploads/archivo.jpg"
  }
}
```

### 3) Generar PDF como usuario autenticado

**POST** `http://62.169.22.80:3000/api/documents`

Header:

```http
Authorization: Bearer TU_TOKEN_JWT
Content-Type: application/json
```

Body JSON con arreglos:

```json
{
  "clientName": "Cliente Demo",
  "documentType": "Cotización",
  "services": ["Instalación de cámaras", "Configuración de DVR"],
  "materials": ["Cable UTP", "Conectores balún", "Fuente de alimentación"],
  "total": 350
}
```

Body JSON también válido con texto:

```json
{
  "clientName": "Cliente Demo",
  "documentType": "Venta",
  "services": "Instalación de cámaras\nConfiguración de DVR",
  "materials": "Cable UTP\nConectores\nFuente",
  "total": "350.00"
}
```

### 4) Listar documentos del usuario autenticado

**GET** `http://62.169.22.80:3000/api/documents`

Header:

```http
Authorization: Bearer TU_TOKEN_JWT
```

---

## Endpoints administrativos para Postman

Estos endpoints usan:

```http
x-api-key: kjkszpj
```

También puedes usar:

```http
Authorization: Bearer kjkszpj
```

### 5) Listar todos los usuarios

**GET** `http://62.169.22.80:3000/api/admin/users`

Ejemplo con curl:

```bash
curl -H "x-api-key: kjkszpj" http://62.169.22.80:3000/api/admin/users
```

### 6) Listar documentos de un usuario específico

**GET** `http://62.169.22.80:3000/api/admin/users/1/documents`

Ejemplo:

```bash
curl -H "x-api-key: kjkszpj" http://62.169.22.80:3000/api/admin/users/1/documents
```

### 7) Generar PDF para cualquier usuario desde Postman

**POST** `http://62.169.22.80:3000/api/admin/documents`

Header:

```http
x-api-key: kjkszpj
Content-Type: application/json
```

Body JSON:

```json
{
  "userId": 1,
  "clientName": "Cliente generado desde Postman",
  "documentType": "Cotización",
  "services": ["Mantenimiento de cámara", "Cambio de conectores DC"],
  "materials": ["Balún", "Conector DC", "Mano de obra"],
  "total": 80
}
```

Versión válida con texto:

```json
{
  "userId": 1,
  "clientName": "Cliente generado desde Postman",
  "documentType": "Venta",
  "services": "Servicio técnico\nPruebas",
  "materials": "Conector DC\nBalún\nFuente",
  "total": "95.50"
}
```

---

## Consultas rápidas desde terminal del VPS

### Ver usuarios desde la API

```bash
curl -H "x-api-key: kjkszpj" http://127.0.0.1:3000/api/admin/users
```

### Ver documentos del usuario 1 desde la API

```bash
curl -H "x-api-key: kjkszpj" http://127.0.0.1:3000/api/admin/users/1/documents
```

### Generar PDF administrativo desde la API

```bash
curl -X POST http://127.0.0.1:3000/api/admin/documents \
  -H "x-api-key: kjkszpj" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "clientName": "Cliente VPS",
    "documentType": "Cotización",
    "services": ["Instalación de cámara", "Configuración"],
    "materials": ["UTP", "Balún", "Conector"],
    "total": 150
  }'
```

---

## Consultas directas a la base de datos SQLite

Base de datos:

```bash
/opt/apps/securityquotes-api/data/securityquotes.db
```

### Entrar a SQLite

```bash
cd /opt/apps/securityquotes-api
sqlite3 data/securityquotes.db
```

### Ver tablas

```sql
.tables
```

### Ver todos los usuarios

```sql
SELECT id, username, email, image_url, created_at
FROM users
ORDER BY id DESC;
```

### Contar usuarios registrados

```sql
SELECT COUNT(*) AS total_usuarios
FROM users;
```

### Ver documentos generados

```sql
SELECT id, user_id, client_name, document_type, total, pdf_url, created_at
FROM documents
ORDER BY id DESC;
```

### Ver documentos junto con el usuario

```sql
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
```

### Ver cuántos documentos tiene cada usuario

```sql
SELECT u.id,
       u.username,
       u.email,
       COUNT(d.id) AS cantidad_documentos
FROM users u
LEFT JOIN documents d ON d.user_id = u.id
GROUP BY u.id, u.username, u.email
ORDER BY u.id DESC;
```

### Salir de SQLite

```sql
.quit
```

---

## Causa corregida del error HTTP 400 al generar PDF

La ruta `POST /api/documents` antes exigía estrictamente que `services` y `materials` llegaran como arreglos JSON. Si por algún motivo llegaban como texto, la API devolvía `400`.

Ahora la API:

- acepta arreglos
- acepta texto por líneas
- acepta texto separado por comas o punto y coma
- devuelve errores más claros cuando falta `clientName`, `documentType` o si `total` es inválido

---

## Archivo de Postman

Se incluye una colección lista para importar en:

```text
securityquotes-api/postman/SecurityQuotes-API.postman_collection.json
```

---

## Nota operativa

Tus claves actuales son:

- `JWT_SECRET=cesar`
- `ADMIN_API_KEY=kjkszpj`

Funcionan, pero son débiles. Si luego quieres endurecer seguridad, cambia esos valores en `.env` y reinicia el contenedor.
