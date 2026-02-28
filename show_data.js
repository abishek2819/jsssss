const db = require('better-sqlite3')('blog.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables found:', tables);

tables.forEach(t => {
    try {
        const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
        console.log(`\nColumns in [${t.name}]:`, cols.map(c => c.name));
    } catch (e) {
        console.log('Error reading', t.name, e.message);
    }
});
db.close();
