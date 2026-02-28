// ── Shared Auth Utilities ─────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000';

function getToken() { return localStorage.getItem('blog_token'); }
function getUser() {
    try { return JSON.parse(localStorage.getItem('blog_user')); }
    catch { return null; }
}
function saveAuth(token, user) {
    localStorage.setItem('blog_token', token);
    localStorage.setItem('blog_user', JSON.stringify(user));
}
function clearAuth() {
    localStorage.removeItem('blog_token');
    localStorage.removeItem('blog_user');
}
function isLoggedIn() { return !!getToken(); }

function requireLogin() {
    if (!isLoggedIn()) { window.location.href = 'index.html'; return false; }
    return true;
}
function redirectIfLoggedIn() {
    if (isLoggedIn()) { window.location.href = 'blog.html'; }
}

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_BASE + path, { ...options, headers });
    if (res.status === 401) { clearAuth(); window.location.href = 'index.html'; return; }
    return res;
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str = '') {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInitials(name = '') {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
