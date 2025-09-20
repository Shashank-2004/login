const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY || 'KiphT3fMKYK174IR';

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'No token provided' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    req.user = payload; // { id, role, schoolId, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
}

module.exports = { authMiddleware, requireAdmin };