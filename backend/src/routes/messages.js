const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../auth');

router.post('/', auth.authenticate, (req, res) => {
    const { receiver_id, content, type = 'text', image_url } = req.body;
    if (!receiver_id) {
        return res.status(400).json({ error: 'Receiver ID required' });
    }
    if (!content && !image_url) {
        return res.status(400).json({ error: 'Content or image required' });
    }
    try {
        const info = db.run(
            'INSERT INTO messages (sender_id, receiver_id, content, type, image_url) VALUES (?, ?, ?, ?, ?)',
            [req.userId, receiver_id, content, type, image_url]
        );
        const message = db.get(
            `SELECT m.*, u.username as sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
            [info.lastInsertRowid]
        );
        res.status(201).json(message);
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

router.get('/:userId', auth.authenticate, (req, res) => {
    const otherUserId = req.params.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    try {
        const messages = db.all(
            `
            SELECT m.*, u1.username as sender_name, u2.username as receiver_name
            FROM messages m
            JOIN users u1 ON u1.id = m.sender_id
            JOIN users u2 ON u2.id = m.receiver_id
            WHERE (m.sender_id = ? AND m.receiver_id = ?)
               OR (m.sender_id = ? AND m.receiver_id = ?)
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
            `,
            [req.userId, otherUserId, otherUserId, req.userId, limit, offset]
        );
        db.run('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
            [otherUserId, req.userId]);
        res.json(messages.reverse());
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

router.get('/chats/list', auth.authenticate, (req, res) => {
    try {
        const chats = db.all(
            `
            SELECT 
                u.id,
                u.username,
                u.avatar,
                u.status,
                (
                    SELECT content FROM messages 
                    WHERE (sender_id = u.id AND receiver_id = ?) 
                       OR (sender_id = ? AND receiver_id = u.id)
                    ORDER BY created_at DESC LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM messages 
                    WHERE (sender_id = u.id AND receiver_id = ?) 
                       OR (sender_id = ? AND receiver_id = u.id)
                    ORDER BY created_at DESC LIMIT 1
                ) as last_message_time,
                (
                    SELECT COUNT(*) FROM messages 
                    WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0
                ) as unread_count
            FROM contacts c
            JOIN users u ON u.id = c.contact_id
            WHERE c.user_id = ?
            ORDER BY last_message_time DESC
            `,
            [req.userId, req.userId, req.userId, req.userId, req.userId, req.userId]
        );
        res.json(chats);
    } catch (err) {
        console.error('Get chats error:', err);
        res.status(500).json({ error: 'Failed to get chats' });
    }
});

module.exports = router;