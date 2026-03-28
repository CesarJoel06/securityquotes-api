require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./db');
const { authRequired, adminRequired } = require('./middleware');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const uploadsDir = path.join(__dirname, '..', 'uploads');
const generatedDir = path.join(__dirname, '..', 'generated');

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const safeOriginal = path.basename(file.originalname || 'archivo').replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safeOriginal}`);
  }
});

const upload = multer({ storage });

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/generated', express.static(generatedDir));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'API funcionando correctamente',
    baseUrl: getPublicBaseUrl(req),
    port: PORT
  });
});

app.post('/api/auth/register', upload.single('image'), async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'username, email y password son obligatorios' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await getUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const imageUrl = req.file ? `${getPublicBaseUrl(req)}/uploads/${req.file.filename}` : null;

    const result = await runQuery(
      'INSERT INTO users (username, email, password_hash, image_url) VALUES (?, ?, ?, ?)',
      [String(username).trim(), normalizedEmail, passwordHash, imageUrl]
    );

    return res.status(201).json({
      message: 'Usuario registrado correctamente',
      userId: result.lastID,
      imageUrl
    });
  } catch (error) {
    console.error('register_error', error);
    return res.status(500).json({ message: 'Error interno al registrar usuario' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'email y password son obligatorios' });
    }

    const user = await getUserByEmail(String(email).trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const validPassword = await bcrypt.compare(String(password), user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        imageUrl: user.image_url
      }
    });
  } catch (error) {
    console.error('login_error', error);
    return res.status(500).json({ message: 'Error interno al iniciar sesión' });
  }
});

app.post('/api/documents', authRequired, async (req, res) => {
  try {
    const payload = buildDocumentPayload(req.body);
    const created = await createDocumentRecord({
      baseUrl: getPublicBaseUrl(req),
      userId: req.user.id,
      username: req.user.username,
      ...payload
    });

    return res.status(201).json({
      message: 'Documento generado correctamente',
      documentId: created.documentId,
      pdfUrl: created.pdfUrl
    });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message, details: error.details || null });
    }
    console.error('document_error', error);
    return res.status(500).json({ message: 'No se pudo generar el documento' });
  }
});

app.get('/api/documents', authRequired, async (req, res) => {
  try {
    const documents = await allQuery(
      `SELECT id, user_id AS userId, client_name AS clientName, document_type AS documentType,
              services_json AS servicesJson, materials_json AS materialsJson, total, pdf_url AS pdfUrl,
              created_at AS createdAt
       FROM documents
       WHERE user_id = ?
       ORDER BY id DESC`,
      [req.user.id]
    );

    return res.json({
      count: documents.length,
      documents: documents.map(formatDocumentRow)
    });
  } catch (error) {
    console.error('documents_list_error', error);
    return res.status(500).json({ message: 'No se pudieron listar los documentos' });
  }
});

app.get('/api/admin/users', adminRequired, async (_req, res) => {
  try {
    const users = await allQuery(
      `SELECT u.id, u.username, u.email, u.image_url AS imageUrl, u.created_at AS createdAt,
              COUNT(d.id) AS documentsCount
       FROM users u
       LEFT JOIN documents d ON d.user_id = u.id
       GROUP BY u.id, u.username, u.email, u.image_url, u.created_at
       ORDER BY u.id DESC`
    );

    return res.json({ count: users.length, users });
  } catch (error) {
    console.error('admin_users_error', error);
    return res.status(500).json({ message: 'No se pudieron listar los usuarios' });
  }
});

app.get('/api/admin/users/:userId/documents', adminRequired, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'userId inválido' });
    }

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const documents = await allQuery(
      `SELECT id, user_id AS userId, client_name AS clientName, document_type AS documentType,
              services_json AS servicesJson, materials_json AS materialsJson, total, pdf_url AS pdfUrl,
              created_at AS createdAt
       FROM documents
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId]
    );

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        imageUrl: user.image_url,
        createdAt: user.created_at
      },
      count: documents.length,
      documents: documents.map(formatDocumentRow)
    });
  } catch (error) {
    console.error('admin_user_documents_error', error);
    return res.status(500).json({ message: 'No se pudieron listar los documentos del usuario' });
  }
});

app.post('/api/admin/documents', adminRequired, async (req, res) => {
  try {
    const userId = Number(req.body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'userId es obligatorio y debe ser numérico' });
    }

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const payload = buildDocumentPayload(req.body);
    const created = await createDocumentRecord({
      baseUrl: getPublicBaseUrl(req),
      userId: user.id,
      username: user.username,
      ...payload
    });

    return res.status(201).json({
      message: 'Documento generado correctamente para el usuario',
      documentId: created.documentId,
      pdfUrl: created.pdfUrl,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    if (error && error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message, details: error.details || null });
    }
    console.error('admin_document_error', error);
    return res.status(500).json({ message: 'No se pudo generar el documento administrativo' });
  }
});

app.use((_, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});

function getPublicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL && String(process.env.PUBLIC_BASE_URL).trim()) {
    return String(process.env.PUBLIC_BASE_URL).trim().replace(/\/$/, '');
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(',')[0]?.trim() || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

function buildDocumentPayload(rawBody = {}) {
  const clientName = String(rawBody.clientName || '').trim();
  const documentType = String(rawBody.documentType || '').trim();
  const services = normalizeList(rawBody.services ?? rawBody.servicesText ?? rawBody.services_text);
  const materials = normalizeList(rawBody.materials ?? rawBody.materialsText ?? rawBody.materials_text);
  const total = parseMoney(rawBody.total);

  const details = {};
  if (!clientName) details.clientName = 'clientName es obligatorio';
  if (!documentType) details.documentType = 'documentType es obligatorio';
  if (!Number.isFinite(total)) details.total = 'total debe ser un número válido';

  if (Object.keys(details).length > 0) {
    const error = new Error('Datos incompletos o inválidos para generar el documento');
    error.statusCode = 400;
    error.details = details;
    throw error;
  }

  return { clientName, documentType, services, materials, total };
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (value == null) {
    return [];
  }

  return [String(value).trim()].filter(Boolean);
}

function parseMoney(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(/,/g, '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  if (value == null || value === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function createDocumentRecord({ baseUrl, userId, username, clientName, documentType, services, materials, total }) {
  const filename = `documento-${Date.now()}-${userId}.pdf`;
  const filepath = path.join(generatedDir, filename);
  const pdfUrl = `${baseUrl}/generated/${filename}`;

  await buildPdf({
    filepath,
    username,
    clientName,
    documentType,
    services,
    materials,
    total
  });

  const result = await runQuery(
    `INSERT INTO documents (user_id, client_name, document_type, services_json, materials_json, total, pdf_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      clientName,
      documentType,
      JSON.stringify(services),
      JSON.stringify(materials),
      Number(total || 0),
      pdfUrl
    ]
  );

  return {
    documentId: result.lastID,
    pdfUrl
  };
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function getUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function formatDocumentRow(row) {
  return {
    id: row.id,
    userId: row.userId,
    clientName: row.clientName,
    documentType: row.documentType,
    services: safeJsonParse(row.servicesJson),
    materials: safeJsonParse(row.materialsJson),
    total: row.total,
    pdfUrl: row.pdfUrl,
    createdAt: row.createdAt
  };
}

function safeJsonParse(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildPdf({ filepath, username, clientName, documentType, services, materials, total }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    doc.fontSize(22).fillColor('#0B2239').text('SecurityQuotes', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(14).fillColor('#1F5C83').text('CCTV • Seguridad electrónica • Recibos • Cotizaciones', { align: 'center' });
    doc.moveDown();

    doc.fontSize(18).fillColor('#000000').text(String(documentType || 'Documento').toUpperCase());
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Instalador: ${username || 'Sin nombre'}`);
    doc.text(`Cliente: ${clientName}`);
    doc.text(`Fecha: ${new Date().toLocaleString('es-PE')}`);
    doc.moveDown();

    doc.fontSize(15).fillColor('#0B2239').text('Servicios');
    doc.moveDown(0.3);
    doc.fontSize(12).fillColor('#000000');
    if (services.length === 0) doc.text('- Sin servicios');
    services.forEach((item, index) => doc.text(`${index + 1}. ${item}`));

    doc.moveDown();
    doc.fontSize(15).fillColor('#0B2239').text('Materiales / implementos');
    doc.moveDown(0.3);
    doc.fontSize(12).fillColor('#000000');
    if (materials.length === 0) doc.text('- Sin materiales');
    materials.forEach((item, index) => doc.text(`${index + 1}. ${item}`));

    doc.moveDown();
    doc.fontSize(16).fillColor('#1F5C83').text(`Total: S/ ${Number(total || 0).toFixed(2)}`, { align: 'right' });

    doc.moveDown(2);
    doc.fontSize(11).fillColor('#555555').text(
      'Documento generado automáticamente por SecurityQuotes para control de servicios, ventas y cotizaciones de seguridad electrónica.',
      { align: 'center' }
    );

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
