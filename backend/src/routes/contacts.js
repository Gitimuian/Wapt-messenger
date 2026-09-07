const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../auth');

router.get('/', auth.authenticate, (req, res) => {
    try {
        const contacts = db.all(
            `
            SELECT u.id, u.username, u.avatar, u.status, u.last_seen, c.created_at as added_at
            FROM contacts c
            JOIN users u ON u.id = c.contact_id
            WHERE c.user_id = ?
            ORDER BY u.username
            `,
            [req.userId]
        );
        res.json(contacts);
    } catch (err) {
        console.error('Get contacts error:', err);
        res.status(500).json({ error: 'Failed to get contacts' });
    }
});

router.post('/', auth.authenticate, (req, res) => {
    const { contact_username } = req.body;
    if (!contact_username) {
        return res.status(400).json({ error: 'Contact username required' });
    }
    try {
        const user = db.get('SELECT id FROM users WHERE username = ?', [contact_username]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (user.id === req.userId) {
            return res.status(400).json({ error: 'Cannot add yourself' });
        }
        db.run('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)', [req.userId, user.id]);
        db.run('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)', [user.id, req.userId]);
        res.status(201).json({ message: 'Contact added successfully', contact_id: user.id });
    } catch (err) {
        console.error('Add contact error:', err);
        res.status(500).json({ error: 'Failed to add contact' });
    }
});

router.delete('/:contactId', auth.authenticate, (req, res) => {
    const contactId = req.params.contactId;
    try {
        db.run('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?', [req.userId, contactId]);
        db.run('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?', [contactId, req.userId]);
        res.json({ message: 'Contact removed successfully' });
    } catch (err) {
        console.error('Remove contact error:', err);
        res.status(500).json({ error: 'Failed to remove contact' });
    }
});

router.get('/search', auth.authenticate, (req, res) => {
    const query = req.query.q || '';
    if (query.length < 2) {
        return res.json([]);
    }
    try {
        const users = db.all(
            `SELECT id, username, avatar, status FROM users WHERE username LIKE ? AND id != ? LIMIT 10`,
            [`%${query}%`, req.userId]
        );
        res.json(users);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;