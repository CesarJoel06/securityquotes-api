# securityquotes-api

Backend de ejemplo con:

- Express
- SQLite
- JWT
- bcrypt
- PDFKit
- Docker

## 1) Preparación

```bash
cp .env.example .env
```

Edita `.env` y cambia:

- `JWT_SECRET`
- `PUBLIC_BASE_URL`

## 2) Ejecutar con Docker

```bash
docker compose up -d --build
```

## 3) Probar salud

```bash
curl http://TU_IP_O_DOMINIO:3000/api/health
```

## 4) Endpoints

### Registro
`POST /api/auth/register`

```json
{
  "name": "César Chumpitas Palomino",
  "email": "cesar@example.com",
  "password": "123456",
  "confirmPassword": "123456",
  "specialty": "Seguridad electrónica",
  "extraField": "Instalaciones CCTV"
}
```

### Login
`POST /api/auth/login`

```json
{
  "email": "cesar@example.com",
  "password": "123456"
}
```

### Crear cotización / venta
`POST /api/documents`

Header:
`Authorization: Bearer TU_TOKEN`

```json
{
  "clientName": "Cliente Demo",
  "documentType": "COTIZACION",
  "projectType": "Instalación CCTV",
  "notes": "Incluye configuración y puesta en marcha",
  "items": [
    {
      "category": "Servicio",
      "description": "Instalación de 4 cámaras",
      "quantity": 1,
      "unitPrice": 350.0
    },
    {
      "category": "Material",
      "description": "Cable UTP",
      "quantity": 2,
      "unitPrice": 45.0
    }
  ]
}
```

## 5) Persistencia

- SQLite queda en `./data`
- PDFs quedan en `./generated`
