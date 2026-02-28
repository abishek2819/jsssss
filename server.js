require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'student_blog_secret_key_2024';
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));   // serve all HTML/CSS/JS from project root

// ── Database setup ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'blog.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    bio           TEXT    DEFAULT '',
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blogs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    excerpt    TEXT DEFAULT '',
    tags       TEXT DEFAULT '',
    author_id  INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS likes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    blog_id INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    UNIQUE(blog_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    blog_id    INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    content    TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now'))
  );
`);

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token invalid or expired' });
  }
}

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { }
  }
  next();
}

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password)
    return res.status(400).json({ message: 'All fields required' });
  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ message: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ).run(username, email, hash);

  const token = jwt.sign({ id: result.lastInsertRowid, username, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ ok: true, token, user: { id: result.lastInsertRowid, username, email } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    JWT_SECRET, { expiresIn: '7d' }
  );
  res.json({ ok: true, token, user: { id: user.id, username: user.username, email: user.email } });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, bio, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ── Blog routes ───────────────────────────────────────────────────────────────
app.get('/api/blogs', optionalAuth, (req, res) => {
  const { search, tag, author } = req.query;
  let query = `
    SELECT b.id, b.title, b.excerpt, b.tags, b.created_at, b.updated_at,
           u.id AS author_id, u.username AS author_name,
           (SELECT COUNT(*) FROM likes WHERE blog_id = b.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE blog_id = b.id) AS comment_count
    FROM blogs b JOIN users u ON b.author_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (search) { query += ' AND (b.title LIKE ? OR b.content LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (tag) { query += ' AND b.tags LIKE ?'; params.push(`%${tag}%`); }
  if (author) { query += ' AND b.author_id = ?'; params.push(author); }
  query += ' ORDER BY b.created_at DESC';

  const blogs = db.prepare(query).all(...params);
  res.json(blogs);
});

app.post('/api/blogs', requireAuth, (req, res) => {
  const { title, content, tags = '' } = req.body || {};
  if (!title || !content) return res.status(400).json({ message: 'Title and content required' });
  const excerpt = content.replace(/<[^>]*>/g, '').slice(0, 200);
  const result = db.prepare(
    'INSERT INTO blogs (title, content, excerpt, tags, author_id) VALUES (?,?,?,?,?)'
  ).run(title, content, excerpt, tags, req.user.id);
  res.json({ ok: true, id: result.lastInsertRowid });
});

app.get('/api/blogs/:id', optionalAuth, (req, res) => {
  const blog = db.prepare(`
    SELECT b.*, u.username AS author_name, u.bio AS author_bio,
           (SELECT COUNT(*) FROM likes WHERE blog_id = b.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE blog_id = b.id) AS comment_count
    FROM blogs b JOIN users u ON b.author_id = u.id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!blog) return res.status(404).json({ message: 'Blog not found' });

  const liked = req.user
    ? !!db.prepare('SELECT 1 FROM likes WHERE blog_id=? AND user_id=?').get(blog.id, req.user.id)
    : false;
  res.json({ ...blog, liked });
});

app.put('/api/blogs/:id', requireAuth, (req, res) => {
  const blog = db.prepare('SELECT * FROM blogs WHERE id = ?').get(req.params.id);
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  if (blog.author_id !== req.user.id) return res.status(403).json({ message: 'Not your blog' });

  const { title, content, tags } = req.body || {};
  if (!title || !content) return res.status(400).json({ message: 'Title and content required' });
  const excerpt = content.replace(/<[^>]*>/g, '').slice(0, 200);
  db.prepare(
    "UPDATE blogs SET title=?, content=?, excerpt=?, tags=?, updated_at=datetime('now') WHERE id=?"
  ).run(title, content, excerpt, tags ?? blog.tags, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/blogs/:id', requireAuth, (req, res) => {
  const blog = db.prepare('SELECT * FROM blogs WHERE id = ?').get(req.params.id);
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  if (blog.author_id !== req.user.id) return res.status(403).json({ message: 'Not your blog' });
  db.prepare('DELETE FROM blogs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Likes ─────────────────────────────────────────────────────────────────────
app.post('/api/blogs/:id/like', requireAuth, (req, res) => {
  const blogId = req.params.id;
  const blog = db.prepare('SELECT id FROM blogs WHERE id = ?').get(blogId);
  if (!blog) return res.status(404).json({ message: 'Blog not found' });

  const existing = db.prepare('SELECT id FROM likes WHERE blog_id=? AND user_id=?').get(blogId, req.user.id);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE blog_id=? AND user_id=?').run(blogId, req.user.id);
  } else {
    db.prepare('INSERT INTO likes (blog_id, user_id) VALUES (?,?)').run(blogId, req.user.id);
  }
  const count = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE blog_id=?').get(blogId).c;
  res.json({ ok: true, liked: !existing, count });
});

// ── Comments ──────────────────────────────────────────────────────────────────
app.get('/api/blogs/:id/comments', (req, res) => {
  const comments = db.prepare(`
    SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.blog_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(comments);
});

app.post('/api/blogs/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ message: 'Comment cannot be empty' });
  const blog = db.prepare('SELECT id FROM blogs WHERE id = ?').get(req.params.id);
  if (!blog) return res.status(404).json({ message: 'Blog not found' });
  const result = db.prepare(
    'INSERT INTO comments (blog_id, user_id, content) VALUES (?,?,?)'
  ).run(req.params.id, req.user.id, content.trim());
  const comment = db.prepare(`
    SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username
    FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(result.lastInsertRowid);
  res.json(comment);
});

// ── Delete Comment ────────────────────────────────────────────────────────────
app.delete('/api/blogs/:id/comments/:commentId', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ message: 'Not your comment' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.commentId);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`🚀 Blog server running at http://localhost:${PORT}`));
