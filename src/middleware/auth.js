const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Token no enviado" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido o vencido" });
  }
}

module.exports = authMiddleware;
