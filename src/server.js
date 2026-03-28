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
const { authRequired, adminKeyRequired } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, '..', 'uploads');
const generatedDir = path.join(__dirname, '..', 'generated');

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

app.set('trust proxy', true);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const safeOriginalName = (file.originalname || 'archivo')
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeOriginalName}`);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use('/generated', express.static(generatedDir, {
  setHeaders(res, filePath) {
    if (path.extname(filePath).toLowerCase() === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
  }
}));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'API funcionando correctamente',
    baseUrl: getBaseUrl(req),
    now: new Date().toISOString(),
    adminEndpointsEnabled: Boolean(process.env.ADMIN_API_KEY)
  });
});

app.post('/api/auth/register', upload.single('image'), async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'username, email y password son obligatorios' });
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const imageUrl = req.file ? `${getBaseUrl(req)}/uploads/${req.file.filename}` : null;

    const result = await runQuery(
      'INSERT INTO users (username, email, password_hash, image_url) VALUES (?, ?, ?, ?)',
      [sanitizeText(username), sanitizeText(email), passwordHash, imageUrl]
    );

    return res.status(201).json({
      message: 'Usuario registrado correctamente',
      userId: result.lastID,
      imageUrl
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error interno al registrar usuario' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email y password son obligatorios' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
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
    console.error(error);
    return res.status(500).json({ message: 'Error interno al iniciar sesión' });
  }
});

app.get('/api/admin/users', adminKeyRequired, async (req, res) => {
  try {
    const limit = normalizeLimit(req.query.limit, 200);
    const rows = await allQuery(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.image_url AS imageUrl,
        u.created_at AS createdAt,
        COUNT(d.id) AS documentsCount,
        MAX(d.created_at) AS lastDocumentAt
      FROM users u
      LEFT JOIN documents d ON d.user_id = u.id
      GROUP BY u.id, u.username, u.email, u.image_url, u.created_at
      ORDER BY u.created_at DESC
      LIMIT ?
    `, [limit]);

    return res.json({
      total: rows.length,
      items: rows
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo listar usuarios' });
  }
});

app.get('/api/admin/users/:userId/documents', adminKeyRequired, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'userId inválido' });
    }

    const rows = await allQuery(`
      SELECT
        id,
        user_id AS userId,
        client_name AS clientName,
        document_type AS documentType,
        services_json AS servicesJson,
        materials_json AS materialsJson,
        total,
        pdf_url AS pdfUrl,
        created_at AS createdAt
      FROM documents
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [userId]);

    return res.json({
      total: rows.length,
      items: rows.map(formatDocumentRow)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo listar documentos del usuario' });
  }
});

app.post('/api/documents', authRequired, async (req, res) => {
  try {
    const clientName = sanitizeText(req.body.clientName);
    const documentType = sanitizeText(req.body.documentType);
    const services = normalizeItems(req.body.services);
    const materials = normalizeItems(req.body.materials);
    const total = normalizeTotal(req.body.total);

    if (!clientName || !documentType) {
      return res.status(400).json({ message: 'clientName y documentType son obligatorios' });
    }

    const filename = `documento-${Date.now()}.pdf`;
    const filepath = path.join(generatedDir, filename);
    const pdfUrl = `${getBaseUrl(req)}/generated/${filename}`;

    await buildPdf({
      filepath,
      username: req.user.username,
      clientName,
      documentType,
      services,
      materials,
      total
    });

    const result = await runQuery(
      'INSERT INTO documents (user_id, client_name, document_type, services_json, materials_json, total, pdf_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        req.user.id,
        clientName,
        documentType,
        JSON.stringify(services),
        JSON.stringify(materials),
        total,
        pdfUrl
      ]
    );

    return res.status(201).json({
      message: 'Documento generado correctamente',
      documentId: result.lastID,
      pdfUrl,
      fileName: filename,
      totals: {
        total,
        services: services.length,
        materials: materials.length
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: 'No se pudo generar el documento',
      detail: error.message || 'Error inesperado al crear PDF'
    });
  }
});

app.get('/api/documents', authRequired, async (req, res) => {
  try {
    const rows = await allQuery(`
      SELECT
        id,
        user_id AS userId,
        client_name AS clientName,
        document_type AS documentType,
        services_json AS servicesJson,
        materials_json AS materialsJson,
        total,
        pdf_url AS pdfUrl,
        created_at AS createdAt
      FROM documents
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [req.user.id]);

    return res.json({
      total: rows.length,
      items: rows.map(formatDocumentRow)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo listar documentos' });
  }
});

app.use((_, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Servidor activo en ${process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`}`);
});

function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

function sanitizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeItems(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeText(item))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((item) => sanitizeText(item))
      .filter(Boolean);
  }

  return [];
}

function normalizeTotal(value) {
  const normalized = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 1000);
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
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
    total: Number(row.total || 0),
    pdfUrl: row.pdfUrl,
    createdAt: row.createdAt
  };
}

function safeJsonParse(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function buildPdf({ filepath, username, clientName, documentType, services, materials, total }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 45,
      info: {
        Title: `${documentType} - ${clientName}`,
        Author: username,
        Subject: 'Cotización / comprobante de servicio',
        Creator: 'SecurityQuotes API'
      }
    });

    const stream = fs.createWriteStream(filepath);
    let settled = false;

    const finish = (fn, arg) => {
      if (!settled) {
        settled = true;
        fn(arg);
      }
    };

    stream.on('finish', () => finish(resolve));
    stream.on('error', (error) => {
      cleanupFile(filepath);
      finish(reject, error);
    });
    doc.on('error', (error) => {
      cleanupFile(filepath);
      finish(reject, error);
    });

    doc.pipe(stream);

    const accent = '#1F5C83';
    const dark = '#0B2239';

    doc.font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(dark)
      .text('SecurityQuotes', { align: 'center' });

    doc.moveDown(0.2);
    doc.font('Helvetica')
      .fontSize(11)
      .fillColor('#4A5568')
      .text('Seguridad electrónica | Instalaciones | Cotizaciones | Servicios', { align: 'center' });

    drawDivider(doc, '#D6E2EA');

    doc.moveDown(0.3);
    doc.font('Helvetica-Bold')
      .fontSize(17)
      .fillColor('#000000')
      .text(documentType.toUpperCase());

    doc.moveDown(0.5);
    doc.font('Helvetica')
      .fontSize(11)
      .fillColor('#000000');
    doc.text(`Instalador: ${sanitizeText(username) || 'Sin nombre'}`);
    doc.text(`Cliente: ${clientName}`);
    doc.text(`Fecha: ${new Date().toLocaleString('es-PE', { hour12: false })}`);

    doc.moveDown(0.9);
    writeSection(doc, 'Servicios', services, accent);
    doc.moveDown(0.4);
    writeSection(doc, 'Materiales / implementos', materials, accent);

    drawDivider(doc, '#D6E2EA');

    doc.moveDown(0.2);
    doc.font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(accent)
      .text(`TOTAL: S/ ${total.toFixed(2)}`, { align: 'right' });

    doc.moveDown(1.6);
    doc.font('Helvetica')
      .fontSize(9)
      .fillColor('#667085')
      .text(
        'Documento generado automáticamente por SecurityQuotes para control de servicios, ventas y cotizaciones.',
        { align: 'center' }
      );

    doc.end();
  });
}

function writeSection(doc, title, items, accent) {
  ensureSpace(doc, 120);
  doc.font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(accent)
    .text(title);

  doc.moveDown(0.25);
  doc.font('Helvetica')
    .fontSize(11)
    .fillColor('#000000');

  if (!items.length) {
    doc.text('- Sin registros');
    return;
  }

  items.forEach((item, index) => {
    ensureSpace(doc, 36);
    doc.text(`${index + 1}. ${item}`);
  });
}

function ensureSpace(doc, minRemaining) {
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (remaining < minRemaining) {
    doc.addPage();
  }
}

function drawDivider(doc, color) {
  doc.moveDown(0.7);
  const y = doc.y;
  doc.save();
  doc.strokeColor(color).lineWidth(1);
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
  doc.restore();
  doc.moveDown(0.7);
}

function cleanupFile(filepath) {
  if (fs.existsSync(filepath)) {
    try {
      fs.unlinkSync(filepath);
    } catch (_) {
      // noop
    }
  }
}
