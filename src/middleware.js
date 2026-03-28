const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

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

function adminRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const apiKey = req.headers['x-api-key'] || bearerToken;

  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({ message: 'ADMIN_API_KEY no está configurada en el servidor' });
  }

  if (!apiKey) {
    return res.status(401).json({ message: 'Clave administrativa requerida' });
  }

  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ message: 'Clave administrativa inválida' });
  }

  next();
}

module.exports = { authRequired, adminRequired };
