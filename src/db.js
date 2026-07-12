import Database from 'better-sqlite3';
import { config } from './config.js';

let db;

export function initDb() {
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');

  // quotes 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      message_id TEXT UNIQUE,
      author_name TEXT NOT NULL,
      author_avatar_url TEXT,
      content TEXT NOT NULL,
      context TEXT,
      image_path TEXT NOT NULL,
      guild_id TEXT,
      guild_name TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  console.log('Database initialized successfully.');
}

export function saveQuote({ id, messageId, authorName, authorAvatarUrl, content, context, imagePath, guildId, guildName }) {
  const stmt = db.prepare(`
    INSERT INTO quotes (id, message_id, author_name, author_avatar_url, content, context, image_path, guild_id, guild_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  return stmt.run(id, messageId, authorName, authorAvatarUrl, content, context, imagePath, guildId, guildName);
}

export function getQuotes(guildId = null) {
  if (guildId) {
    const stmt = db.prepare('SELECT * FROM quotes WHERE guild_id = ? ORDER BY created_at DESC');
    return stmt.all(guildId);
  }
  const stmt = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC');
  return stmt.all();
}

export function getQuoteByMessageId(messageId) {
  const stmt = db.prepare('SELECT * FROM quotes WHERE message_id = ?');
  return stmt.get(messageId);
}

export function searchQuotes(query, guildId = null) {
  const wildCardQuery = `%${query}%`;
  if (guildId) {
    const stmt = db.prepare(`
      SELECT * FROM quotes 
      WHERE guild_id = ? AND (content LIKE ? OR author_name LIKE ? OR context LIKE ?)
      ORDER BY created_at DESC
    `);
    return stmt.all(guildId, wildCardQuery, wildCardQuery, wildCardQuery);
  }
  const stmt = db.prepare(`
    SELECT * FROM quotes 
    WHERE content LIKE ? OR author_name LIKE ? OR context LIKE ?
    ORDER BY created_at DESC
  `);
  return stmt.all(wildCardQuery, wildCardQuery, wildCardQuery);
}
