const jwt = require('jsonwebtoken');

function extractBearer(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

function authRequired(req, res, next) {
  const token = extractBearer(req);

  if (!token) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
}

function adminKeyRequired(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    return res.status(503).json({
      message: 'ADMIN_API_KEY no configurada en el servidor'
    });
  }

  const bearer = extractBearer(req);
  const headerKey = req.headers['x-api-key'];
  const providedKey = typeof headerKey === 'string' && headerKey.trim()
    ? headerKey.trim()
    : bearer;

  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ message: 'Clave de administrador inválida' });
  }

  next();
}

module.exports = { authRequired, adminKeyRequired, extractBearer };
