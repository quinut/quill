import Database from 'better-sqlite3';

console.log('🧹 Clearing all test data from SQLite Database...');

try {
  const db = new Database('data/database.db');
  
  // 외래 키 제약 조건 비활성화 후 데이터 일괄 삭제
  db.exec('PRAGMA foreign_keys = OFF');
  
  const tables = ['votes', 'submissions', 'mission_participants', 'missions', 'users'];
  for (const table of tables) {
    const info = db.prepare(`DELETE FROM ${table}`).run();
    console.log(`Deleted records from table [${table}]: changes = ${info.changes}`);
  }
  
  db.exec('PRAGMA foreign_keys = ON');
  console.log('✅ Database tables cleared successfully.');
} catch (err) {
  console.error('❌ Failed to clear database:', err);
}
