require('dotenv').config();
const oracledb = require('oracledb');

(async () => {
  try {
    const conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECTION_STRING || process.env.ORACLE_CONNECT_STRING
    });

    console.log('Connected to Oracle. Dropping old tables...');

    // Drop in order (due to foreign keys)
    const dropStmts = [
      'DROP TABLE comments',
      'DROP TABLE likes',
      'DROP TABLE blogs',
      'DROP TABLE users'
    ];

    for (const stmt of dropStmts) {
      try {
        await conn.execute(stmt);
        console.log(`✓ ${stmt}`);
      } catch (err) {
        // Table doesn't exist — that's OK
        if (err.errorNum !== 942) console.error(`${stmt} error:`, err.message);
      }
    }

    await conn.commit();
    await conn.close();
    console.log('\n✓ Cleanup done. Restart server now with: node server.js');
    process.exit(0);
  } catch (err) {
    console.error('Cleanup failed:', err.message);
    process.exit(1);
  }
})();
