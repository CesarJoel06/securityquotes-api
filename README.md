# SecurityQuotes API Remaster

Backend con:
- Express
- SQLite
- JWT
- bcryptjs
- multer para imágenes
- PDFKit para recibos y cotizaciones
- endpoint administrativo para revisar usuarios desde Postman

## Qué se corrigió

- Se agregó un endpoint administrativo para listar usuarios desde Postman.
- Se agregó un endpoint administrativo para listar documentos por usuario.
- La URL pública de imágenes y PDFs ahora se calcula automáticamente desde la petición si `PUBLIC_BASE_URL` no está configurado.
- La generación de PDF quedó más robusta y devuelve más información útil para depuración.
- Se acepta `services` y `materials` tanto como arreglos JSON como texto separado por saltos de línea o comas.

## Variables de entorno

Crea un archivo `.env`:

```env
PORT=3000
JWT_SECRET=cambia_esto_por_un_secreto_largo
ADMIN_API_KEY=coloca_aqui_una_clave_privada_para_postman
PUBLIC_BASE_URL=http://TU_IP_O_DOMINIO:3000
```

> Si no defines `PUBLIC_BASE_URL`, la API usará automáticamente el host con el que le lleguen las peticiones.

## Ejecutar con Docker

```bash
docker compose up -d --build
```

## Probar salud

```bash
curl http://TU_IP_O_DOMINIO:3000/api/health
```

## Endpoints

### Salud
`GET /api/health`

### Registro con imagen
`POST /api/auth/register`

Body `form-data`:
- `username`
- `email`
- `password`
- `image` (opcional)

### Login
`POST /api/auth/login`

```json
{
  "email": "correo@ejemplo.com",
  "password": "123456"
}
```

### Generar documento PDF
`POST /api/documents`

Header:
`Authorization: Bearer TU_TOKEN`

```json
{
  "clientName": "Cliente Demo",
  "documentType": "Cotización",
  "services": ["Instalación de cámaras", "Configuración de DVR"],
  "materials": ["Cable UTP", "Conectores"],
  "total": 350
}
```

También acepta:

```json
{
  "clientName": "Cliente Demo",
  "documentType": "Venta",
  "services": "Instalación de cámaras\nConfiguración de DVR",
  "materials": "Cable UTP\nConectores",
  "total": "350,50"
}
```

### Listar documentos del usuario autenticado
`GET /api/documents`

Header:
`Authorization: Bearer TU_TOKEN`

### Listar usuarios para revisión en Postman
`GET /api/admin/users`

Headers:
- `x-api-key: TU_ADMIN_API_KEY`

También puedes usar:
- `Authorization: Bearer TU_ADMIN_API_KEY`

Parámetro opcional:
- `limit=200`

### Listar documentos de un usuario específico
`GET /api/admin/users/:userId/documents`

Headers:
- `x-api-key: TU_ADMIN_API_KEY`

## Ejemplos rápidos con curl

### Listar usuarios

```bash
curl -H "x-api-key: TU_ADMIN_API_KEY" \
  http://TU_IP_O_DOMINIO:3000/api/admin/users
```

### Crear documento

```bash
curl -X POST http://TU_IP_O_DOMINIO:3000/api/documents \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientName":"Cliente Demo",
    "documentType":"Cotización",
    "services":["Instalación de 4 cámaras"],
    "materials":["UTP cat5e", "Balunes"],
    "total":180
  }'
```

## Despliegue en VPS

1. Copia la carpeta `securityquotes-api` al VPS.
2. Crea `.env` a partir de `.env.example`.
3. Ajusta `PUBLIC_BASE_URL` con tu IP pública o dominio.
4. Ejecuta:

```bash
docker compose up -d --build
```

5. Verifica:

```bash
docker compose ps
curl http://TU_IP_O_DOMINIO:3000/api/health
```
