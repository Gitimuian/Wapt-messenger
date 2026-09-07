const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../auth');

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        const hashedPassword = await auth.hashPassword(password);
        db.run(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Username or email already exists' });
                    }
                    return res.status(500).json({ error: 'Registration failed' });
                }
                const token = auth.generateToken(this.lastID, username);
                res.status(201).json({
                    message: 'Registration successful',
                    token,
                    user: { id: this.lastID, username, email }
                });
            }
        );
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { credential, password } = req.body;
        if (!credential || !password) {
            return res.status(400).json({ error: 'Username/email and password required' });
        }
        const user = await auth.getUserByCredential(credential);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isValid = await auth.verifyPassword(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        db.run(
            'UPDATE users SET last_seen = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
            ['online', user.id]
        );
        const token = auth.generateToken(user.id, user.username);
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                status: user.status
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/me', auth.authenticate, async (req, res) => {
    try {
        const user = await auth.getUserById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;