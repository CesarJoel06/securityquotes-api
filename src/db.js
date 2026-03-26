const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "..", "data", "security_quotes.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`PRAGMA foreign_keys = ON`);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      specialty TEXT,
      extra_field TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      document_type TEXT NOT NULL,
      project_type TEXT,
      notes TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      pdf_path TEXT,
      pdf_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS document_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb
};
