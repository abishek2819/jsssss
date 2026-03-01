require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'student_blog_secret_key_2024';
const app = express();

// ── MySQL Connection Pool ────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'blog_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));   // serve all HTML/CSS/JS from project root

// ── Database setup ────────────────────────────────────────────────────────────
async function initializeDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        username      VARCHAR(255) NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        bio           TEXT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS blogs (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        title      VARCHAR(255) NOT NULL,
        content    LONGTEXT NOT NULL,
        excerpt    TEXT,
        tags       VARCHAR(255) DEFAULT '',
        author_id  INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id      INT AUTO_INCREMENT PRIMARY KEY,
        blog_id INT NOT NULL,
        user_id INT NOT NULL,
        UNIQUE(blog_id, user_id),
        FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        blog_id    INT NOT NULL,
        user_id    INT NOT NULL,
        content    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    console.log('✓ Database tables initialized');
  } catch (err) {
    console.error('Database initialization error:', err.message);
  } finally {
    connection.release();
  }
}

initializeDatabase();

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password)
    return res.status(400).json({ message: 'All fields required' });
  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' });

  const connection = await pool.getConnection();
  try {
    const [existing] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await connection.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hash]
    );

    const token = jwt.sign({ id: result.insertId, username, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, user: { id: result.insertId, username, email } });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  } finally {
    connection.release();
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });

  const connection = await pool.getConnection();
  try {
    const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = users[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ ok: true, token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  } finally {
    connection.release();
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [users] = await connection.query(
      'SELECT id, username, email, bio, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json(users[0] || null);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user', error: err.message });
  } finally {
    connection.release();
  }
});

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

// ── Blog routes ───────────────────────────────────────────────────────────────
app.get('/api/blogs', optionalAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
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

    const [blogs] = await connection.query(query, params);
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching blogs', error: err.message });
  } finally {
    connection.release();
  }
});

app.post('/api/blogs', requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { title, content, tags = '' } = req.body || {};
    if (!title || !content) return res.status(400).json({ message: 'Title and content required' });
    const excerpt = content.replace(/<[^>]*>/g, '').slice(0, 200);
    const [result] = await connection.query(
      'INSERT INTO blogs (title, content, excerpt, tags, author_id) VALUES (?,?,?,?,?)',
      [title, content, excerpt, tags, req.user.id]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Error creating blog', error: err.message });
  } finally {
    connection.release();
  }
});

app.get('/api/blogs/:id', optionalAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [blogs] = await connection.query(`
      SELECT b.*, u.username AS author_name, u.bio AS author_bio,
             (SELECT COUNT(*) FROM likes WHERE blog_id = b.id) AS like_count,
             (SELECT COUNT(*) FROM comments WHERE blog_id = b.id) AS comment_count
      FROM blogs b JOIN users u ON b.author_id = u.id
      WHERE b.id = ?
    `, [req.params.id]);

    if (blogs.length === 0) return res.status(404).json({ message: 'Blog not found' });

    const blog = blogs[0];
    let liked = false;
    if (req.user) {
      const [likeResult] = await connection.query(
        'SELECT 1 FROM likes WHERE blog_id=? AND user_id=?',
        [blog.id, req.user.id]
      );
      liked = likeResult.length > 0;
    }
    res.json({ ...blog, liked });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching blog', error: err.message });
  } finally {
    connection.release();
  }
});

app.put('/api/blogs/:id', requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [blogs] = await connection.query('SELECT * FROM blogs WHERE id = ?', [req.params.id]);
    if (blogs.length === 0) return res.status(404).json({ message: 'Blog not found' });

    const blog = blogs[0];
    if (blog.author_id !== req.user.id) return res.status(403).json({ message: 'Not your blog' });

    const { title, content, tags } = req.body || {};
    if (!title || !content) return res.status(400).json({ message: 'Title and content required' });
    const excerpt = content.replace(/<[^>]*>/g, '').slice(0, 200);
    await connection.query(
      "UPDATE blogs SET title=?, content=?, excerpt=?, tags=? WHERE id=?",
      [title, content, excerpt, tags ?? blog.tags, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Error updating blog', error: err.message });
  } finally {
    connection.release();
  }
});

app.delete('/api/blogs/:id', requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [blogs] = await connection.query('SELECT * FROM blogs WHERE id = ?', [req.params.id]);
    if (blogs.length === 0) return res.status(404).json({ message: 'Blog not found' });

    const blog = blogs[0];
    if (blog.author_id !== req.user.id) return res.status(403).json({ message: 'Not your blog' });
    await connection.query('DELETE FROM blogs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting blog', error: err.message });
  } finally {
    connection.release();
  }
});

// ── Likes ─────────────────────────────────────────────────────────────────────
app.post('/api/blogs/:id/like', requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const blogId = req.params.id;
    const [blogs] = await connection.query('SELECT id FROM blogs WHERE id = ?', [blogId]);
    if (blogs.length === 0) return res.status(404).json({ message: 'Blog not found' });

    const [existing] = await connection.query('SELECT id FROM likes WHERE blog_id=? AND user_id=?', [blogId, req.user.id]);
    if (existing.length > 0) {
      await connection.query('DELETE FROM likes WHERE blog_id=? AND user_id=?', [blogId, req.user.id]);
    } else {
      await connection.query('INSERT INTO likes (blog_id, user_id) VALUES (?,?)', [blogId, req.user.id]);
    }
    const [[{ c }]] = await connection.query('SELECT COUNT(*) AS c FROM likes WHERE blog_id=?', [blogId]);
    res.json({ ok: true, liked: existing.length === 0, count: c });
  } catch (err) {
    res.status(500).json({ message: 'Error toggling like', error: err.message });
  } finally {
    connection.release();
  }
});

// ── Comments ──────────────────────────────────────────────────────────────────
app.get('/api/blogs/:id/comments', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [comments] = await connection.query(`
      SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.blog_id = ? ORDER BY c.created_at ASC
    `, [req.params.id]);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching comments', error: err.message });
  } finally {
    connection.release();
  }
});

app.post('/api/blogs/:id/comments', requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ message: 'Comment cannot be empty' });
    const [blogs] = await connection.query('SELECT id FROM blogs WHERE id = ?', [req.params.id]);
    if (blogs.length === 0) return res.status(404).json({ message: 'Blog not found' });

    const [result] = await connection.query(
      'INSERT INTO comments (blog_id, user_id, content) VALUES (?,?,?)',
      [req.params.id, req.user.id, content.trim()]
    );

    const [comments] = await connection.query(`
      SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username
      FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
    `, [result.insertId]);
    res.json(comments[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error creating comment', error: err.message });
  } finally {
    connection.release();
  }
});

// ── Delete Comment ────────────────────────────────────────────────────────────
app.delete('/api/blogs/:id/comments/:commentId', requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [comments] = await connection.query('SELECT * FROM comments WHERE id = ?', [req.params.commentId]);
    if (comments.length === 0) return res.status(404).json({ message: 'Comment not found' });

    const comment = comments[0];
    if (comment.user_id !== req.user.id) return res.status(403).json({ message: 'Not your comment' });
    await connection.query('DELETE FROM comments WHERE id = ?', [req.params.commentId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting comment', error: err.message });
  } finally {
    connection.release();
  }
});

app.listen(PORT, () => console.log(`🚀 Blog server running at http://localhost:${PORT}`));
