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
const { authRequired } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

const uploadsDir = path.join(__dirname, '..', 'uploads');
const generatedDir = path.join(__dirname, '..', 'generated');

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/generated', express.static(generatedDir));

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    message: 'API funcionando correctamente',
    baseUrl: PUBLIC_BASE_URL
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
    const imageUrl = req.file ? `${PUBLIC_BASE_URL}/uploads/${req.file.filename}` : null;

    const result = await runQuery(
      'INSERT INTO users (username, email, password_hash, image_url) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, imageUrl]
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

app.post('/api/documents', authRequired, async (req, res) => {
  try {
    const { clientName, documentType, services, materials, total } = req.body;

    if (!clientName || !documentType || !Array.isArray(services) || !Array.isArray(materials)) {
      return res.status(400).json({ message: 'Datos incompletos para generar el documento' });
    }

    const filename = `documento-${Date.now()}.pdf`;
    const filepath = path.join(generatedDir, filename);
    const pdfUrl = `${PUBLIC_BASE_URL}/generated/${filename}`;

    await buildPdf({
      filepath,
      username: req.user.username,
      clientName,
      documentType,
      services,
      materials,
      total
    });

    await runQuery(
      'INSERT INTO documents (user_id, client_name, document_type, services_json, materials_json, total, pdf_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        req.user.id,
        clientName,
        documentType,
        JSON.stringify(services),
        JSON.stringify(materials),
        Number(total || 0),
        pdfUrl
      ]
    );

    return res.status(201).json({
      message: 'Documento generado correctamente',
      pdfUrl
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'No se pudo generar el documento' });
  }
});

app.use((_, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Servidor activo en ${PUBLIC_BASE_URL}`);
});

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

function buildPdf({ filepath, username, clientName, documentType, services, materials, total }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    doc.fontSize(22).fillColor('#0B2239').text('SecurityQuotes', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor('#1F5C83').text('CCTV • Seguridad electrónica • Recibos • Cotizaciones', { align: 'center' });
    doc.moveDown();

    doc.fontSize(18).fillColor('#000000').text(documentType.toUpperCase());
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Instalador: ${username}`);
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
