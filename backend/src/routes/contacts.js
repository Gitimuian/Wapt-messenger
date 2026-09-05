const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../auth');

// Get all contacts
router.get('/', auth.authenticate, (req, res) => {
    db.all(
        `
        SELECT u.id, u.username, u.avatar, u.status, u.last_seen,
               c.created_at as added_at
        FROM contacts c
        JOIN users u ON u.id = c.contact_id
        WHERE c.user_id = ?
        ORDER BY u.username
        `,
        [req.userId],
        (err, contacts) => {
            if (err) {
                console.error('Get contacts error:', err);
                return res.status(500).json({ error: 'Failed to get contacts' });
            }
            res.json(contacts);
        }
    );
});

// Add contact
router.post('/', auth.authenticate, (req, res) => {
    const { contact_username } = req.body;

    if (!contact_username) {
        return res.status(400).json({ error: 'Contact username required' });
    }

    // Find contact user
    db.get(
        'SELECT id FROM users WHERE username = ?',
        [contact_username],
        (err, user) => {
            if (err) {
                console.error('Find user error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (user.id === req.userId) {
                return res.status(400).json({ error: 'Cannot add yourself' });
            }

            // Add contact
            db.run(
                'INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)',
                [req.userId, user.id],
                function(err) {
                    if (err) {
                        console.error('Add contact error:', err);
                        return res.status(500).json({ error: 'Failed to add contact' });
                    }

                    // Also add reverse contact
                    db.run(
                        'INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)',
                        [user.id, req.userId]
                    );

                    res.status(201).json({
                        message: 'Contact added successfully',
                        contact_id: user.id
                    });
                }
            );
        }
    );
});

// Remove contact
router.delete('/:contactId', auth.authenticate, (req, res) => {
    const contactId = req.params.contactId;

    db.run(
        'DELETE FROM contacts WHERE user_id = ? AND contact_id = ?',
        [req.userId, contactId],
        function(err) {
            if (err) {
                console.error('Remove contact error:', err);
                return res.status(500).json({ error: 'Failed to remove contact' });
            }

            // Also remove reverse contact
            db.run(
                'DELETE FROM contacts WHERE user_id = ? AND contact_id = ?',
                [contactId, req.userId]
            );

            res.json({ message: 'Contact removed successfully' });
        }
    );
});

// Search users
router.get('/search', auth.authenticate, (req, res) => {
    const query = req.query.q || '';

    if (query.length < 2) {
        return res.json([]);
    }

    db.all(
        `
        SELECT id, username, avatar, status 
        FROM users 
        WHERE username LIKE ? AND id != ?
        LIMIT 10
        `,
        [`%${query}%`, req.userId],
        (err, users) => {
            if (err) {
                console.error('Search error:', err);
                return res.status(500).json({ error: 'Search failed' });
            }
            res.json(users);
        }
    );
});

module.exports = router;