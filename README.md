# SecurityQuotes API Remaster

Backend con:
- Express
- SQLite
- JWT
- bcryptjs
- multer para imágenes
- PDFKit para recibos y cotizaciones

## Variables de entorno

Crea un archivo `.env`:

```env
PORT=3000
JWT_SECRET=cambia_esto_por_un_secreto_largo
PUBLIC_BASE_URL=http://62.169.22.80:3000
```

## Ejecutar con Docker

```bash
docker compose up -d --build
```

## Probar salud

```bash
curl http://62.169.22.80:3000/api/health
```

## Endpoints

### Registro con imagen
`POST /api/auth/register`

Form-data:
- username
- email
- password
- image (opcional)

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
