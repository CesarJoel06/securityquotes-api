require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");

const { initDb, run, get, all } = require("./db");
const authMiddleware = require("./middleware/auth");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const generatedDir = path.join(__dirname, "..", "generated");

fs.mkdirSync(generatedDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/files", express.static(generatedDir));

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "securityquotes-api"
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, confirmPassword, specialty, extraField } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "Completa todos los campos obligatorios" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Las contraseñas no coinciden" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }

    const existingUser = await get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
    if (existingUser) {
      return res.status(409).json({ message: "El correo ya está registrado" });
    }

    const hash = await bcrypt.hash(password, 10);

    await run(
      `INSERT INTO users (name, email, password_hash, specialty, extra_field)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        email.toLowerCase().trim(),
        hash,
        specialty?.trim() || "",
        extraField?.trim() || ""
      ]
    );

    return res.status(201).json({ message: "Usuario registrado correctamente" });
  } catch (error) {
    console.error("REGISTER_ERROR", error);
    return res.status(500).json({ message: "Error interno al registrar usuario" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await get(
      `SELECT id, name, email, password_hash, specialty, extra_field
       FROM users WHERE email = ?`,
      [email?.toLowerCase().trim()]
    );

    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const validPassword = await bcrypt.compare(password || "", user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        specialty: user.specialty,
        extraField: user.extra_field
      }
    });
  } catch (error) {
    console.error("LOGIN_ERROR", error);
    return res.status(500).json({ message: "Error interno al iniciar sesión" });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await get(
      `SELECT id, name, email, specialty, extra_field, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        specialty: user.specialty,
        extraField: user.extra_field,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error("ME_ERROR", error);
    return res.status(500).json({ message: "Error consultando perfil" });
  }
});

function drawHeader(doc, title) {
  doc
    .fillColor("#0F172A")
    .fontSize(24)
    .text("Security Quotes", { align: "left" });

  doc
    .moveDown(0.2)
    .fillColor("#334155")
    .fontSize(10)
    .text("Cotizaciones y ventas para seguridad electrónica");

  doc
    .moveDown(1)
    .fillColor("#111827")
    .fontSize(18)
    .text(title);

  doc.moveDown(1);
}

function drawKeyValue(doc, key, value) {
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text(`${key}: `, { continued: true });

  doc
    .font("Helvetica")
    .fillColor("#374151")
    .text(value || "-");
}

function drawItemsTable(doc, items) {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827");
  doc.text("Detalle", 50);
  doc.text("Cant.", 320, doc.y - 12);
  doc.text("P. Unit.", 380, doc.y - 12);
  doc.text("Total", 470, doc.y - 12);
  doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).stroke("#CBD5E1");
  doc.moveDown(0.8);

  items.forEach((item) => {
    const startY = doc.y;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0F172A").text(`${item.category}: ${item.description}`, 50, startY, {
      width: 250
    });
    doc.font("Helvetica").fillColor("#374151");
    doc.text(String(item.quantity), 320, startY, { width: 40 });
    doc.text(`S/ ${Number(item.unit_price).toFixed(2)}`, 380, startY, { width: 70 });
    doc.text(`S/ ${Number(item.total).toFixed(2)}`, 470, startY, { width: 70 });
    doc.moveDown(1.2);
  });
}

function generatePdf({ outputPath, documentId, userName, clientName, documentType, projectType, notes, items, total, subtotal }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);

    drawHeader(doc, documentType === "VENTA" ? "Recibo / Venta" : "Cotización");
    drawKeyValue(doc, "Documento N°", String(documentId));
    drawKeyValue(doc, "Cliente", clientName);
    drawKeyValue(doc, "Tipo", documentType);
    drawKeyValue(doc, "Proyecto", projectType || "Instalación general");
    drawKeyValue(doc, "Responsable", userName);
    drawKeyValue(doc, "Fecha", new Date().toLocaleString("es-PE"));
    if (notes) {
      drawKeyValue(doc, "Notas", notes);
    }

    drawItemsTable(doc, items);

    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827");
    doc.text(`Subtotal: S/ ${Number(subtotal).toFixed(2)}`, { align: "right" });
    doc.text(`Total: S/ ${Number(total).toFixed(2)}`, { align: "right" });

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(10).fillColor("#475569");
    doc.text("Documento generado automáticamente por Security Quotes.", { align: "center" });

    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

app.post("/api/documents", authMiddleware, async (req, res) => {
  try {
    const { clientName, documentType, projectType, notes, items } = req.body;

    if (!clientName || !documentType || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Completa cliente, tipo e ítems" });
    }

    const normalizedItems = items.map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const total = quantity * unitPrice;

      return {
        category: String(item.category || "General").trim(),
        description: String(item.description || "").trim(),
        quantity,
        unit_price: unitPrice,
        total
      };
    });

    const invalidItem = normalizedItems.find(
      (item) => !item.description || item.quantity <= 0 || item.unit_price < 0
    );

    if (invalidItem) {
      return res.status(400).json({ message: "Verifica los ítems: descripción, cantidad y precio" });
    }

    const subtotal = normalizedItems.reduce((acc, item) => acc + item.total, 0);
    const total = subtotal;

    const result = await run(
      `INSERT INTO documents (user_id, client_name, document_type, project_type, notes, subtotal, total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        clientName.trim(),
        documentType.trim(),
        projectType?.trim() || "",
        notes?.trim() || "",
        subtotal,
        total
      ]
    );

    for (const item of normalizedItems) {
      await run(
        `INSERT INTO document_items (document_id, category, description, quantity, unit_price, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          result.id,
          item.category,
          item.description,
          item.quantity,
          item.unit_price,
          item.total
        ]
      );
    }

    const fileName = `documento-${result.id}-${Date.now()}.pdf`;
    const outputPath = path.join(generatedDir, fileName);
    const pdfUrl = `${PUBLIC_BASE_URL}/files/${fileName}`;

    await generatePdf({
      outputPath,
      documentId: result.id,
      userName: req.user.name,
      clientName,
      documentType,
      projectType,
      notes,
      items: normalizedItems,
      total,
      subtotal
    });

    await run(
      `UPDATE documents SET pdf_path = ?, pdf_url = ? WHERE id = ?`,
      [outputPath, pdfUrl, result.id]
    );

    return res.status(201).json({
      id: result.id,
      clientName,
      documentType,
      projectType: projectType || "",
      subtotal,
      total,
      pdfUrl,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("DOCUMENT_CREATE_ERROR", error);
    return res.status(500).json({ message: "No se pudo generar el documento" });
  }
});

app.get("/api/documents", authMiddleware, async (req, res) => {
  try {
    const documents = await all(
      `SELECT id, client_name as clientName, document_type as documentType,
              project_type as projectType, total, pdf_url as pdfUrl, created_at as createdAt
       FROM documents
       WHERE user_id = ?
       ORDER BY id DESC`,
      [req.user.id]
    );

    return res.json({ documents });
  } catch (error) {
    console.error("DOCUMENT_LIST_ERROR", error);
    return res.status(500).json({ message: "No se pudo listar documentos" });
  }
});

(async () => {
  try {
    await initDb();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor corriendo en puerto ${PORT}`);
    });
  } catch (error) {
    console.error("BOOT_ERROR", error);
    process.exit(1);
  }
})();
