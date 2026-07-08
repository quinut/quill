import Database from 'better-sqlite3';
import { config } from './config.js';

let db;

export function getDb() {
  return db;
}

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

  // users 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      points INTEGER DEFAULT 0,
      achievements_list TEXT DEFAULT '[]',
      warning_count INTEGER DEFAULT 0
    )
  `);

  // missions 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reward_points INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // mission_participants 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS mission_participants (
      mission_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (mission_id, user_id),
      FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
    )
  `);

  // submissions 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      proof_text TEXT,
      proof_url TEXT,
      status TEXT DEFAULT 'pending',
      fail_reason TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      expires_at TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
    )
  `);

  // votes 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      vote_type TEXT NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(submission_id, voter_id),
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
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
