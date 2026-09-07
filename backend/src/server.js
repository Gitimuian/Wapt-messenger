const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import modules
const db = require('./database');
const auth = require('./auth');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const contactRoutes = require('./routes/contacts');
const { upload, serveUploads } = require('./uploads');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
serveUploads(app);

// ============================================================
// SERVE FRONTEND STATIC FILES (ADDED THIS SECTION)
// ============================================================
// This serves your HTML, CSS, and JS files from the frontend folder
app.use(express.static(path.join(__dirname, '../../frontend')));

// Root route - serves the main index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contacts', contactRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Image upload endpoint
app.post('/api/upload', auth.authenticate, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ imageUrl });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ============================================================
// WEBSOCKET (Real-time)
// ============================================================
const activeUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
    console.log('⚡ New client connected:', socket.id);

    // Register user
    socket.on('send_message', (data) => {
        activeUsers.set(userId, socket.id);
        console.log(`👤 User ${userId} registered`);
        
        // Update status
        db.run(
            'UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
            ['online', userId]
        );

        // Broadcast online status
        io.emit('user_online', { userId, status: 'online' });
    });

    // Send message
    socket.on('send_message', async (data) => {
        try {
            const { receiver_id, content, type = 'text', image_url } = data;
            const sender_id = data.sender_id;

            // Save to database
            db.run(
                'INSERT INTO messages (sender_id, receiver_id, content, type, image_url, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [sender_id, receiver_id, content, type, image_url],
                function(err) {
                    if (err) {
                        console.error('Save message error:', err);
                        return;
                    }

                    // Get full message with sender info
                    db.get(
                        `
                        SELECT m.*, u.username as sender_name 
                        FROM messages m
                        JOIN users u ON u.id = m.sender_id
                        WHERE m.id = ?
                        `,
                        [this.lastID],
                        (err, message) => {
                            if (err) return;

                            // Send to receiver if online
                            const receiverSocketId = activeUsers.get(receiver_id);
                            if (receiverSocketId) {
                                io.to(receiverSocketId).emit('new_message', message);
                            }

                            // Send back to sender for confirmation
                            socket.emit('message_sent', message);
                        }
                    );
                }
            );
        } catch (error) {
            console.error('Send message error:', error);
        }
    });

    // Mark messages as read
    socket.on('mark_read', ({ sender_id, receiver_id }) => {
        db.run(
            'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
            [sender_id, receiver_id]
        );
    });

    // User typing
    socket.on('typing', ({ receiver_id, is_typing }) => {
        const receiverSocketId = activeUsers.get(receiver_id);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', {
                user_id: data.user_id,
                is_typing
            });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        let disconnectedUserId = null;
        for (let [userId, socketId] of activeUsers) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                activeUsers.delete(userId);
                break;
            }
        }

        if (disconnectedUserId) {
            db.run(
                'UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
                ['offline', disconnectedUserId]
            );
            io.emit('user_offline', { userId: disconnectedUserId });
            console.log(`👋 User ${disconnectedUserId} disconnected`);
        }
    });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = 8080;
server.listen(PORT, () => {
    console.log(`
🚀 LACQUE Backend Server
━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server running on: http://localhost:${PORT}
🔗 WebSocket ready
💾 Database: SQLite
━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
});