const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'lacque-secret-key-2026';
const SALT_ROUNDS = 10;

// Hash password
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Generate JWT
function generateToken(userId, username) {
    return jwt.sign(
        { userId, username },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Verify JWT
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// Middleware: Authenticate request
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

// Get user by ID
function getUserById(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT id, username, email, avatar, status, last_seen, created_at FROM users WHERE id = ?',
            [userId],
            (err, row) => {
                if (err) reject(err);
                resolve(row);
            }
        );
    });
}

// Get user by username or email
function getUserByCredential(credential) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [credential, credential],
            (err, row) => {
                if (err) reject(err);
                resolve(row);
            }
        );
    });
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