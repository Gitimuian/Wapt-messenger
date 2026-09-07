const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'wapt-secret-key-2026';
const SALT_ROUNDS = 10;

async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

function generateToken(userId, username) {
    return jwt.sign(
        { userId, username },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
}

function getUserById(userId) {
    return db.get('SELECT id, username, email, avatar, status, last_seen, created_at FROM users WHERE id = ?', [userId]);
}

function getUserByCredential(credential) {
    return db.get('SELECT * FROM users WHERE username = ? OR email = ?', [credential, credential]);
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateToken,
    verifyToken,
    authenticate,
    getUserById,
    getUserByCredential,
    JWT_SECRET
};