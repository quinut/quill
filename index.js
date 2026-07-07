import fs from 'fs';
import path from 'path';
import { initDb } from './src/db.js';
import { initBot } from './src/bot.js';
import { initServer } from './src/server.js';

// 글로벌 예외 처리
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

async function main() {
  console.log('🏛️  Starting Out of Context Quote Bot & Museum...');

  // 필수 디렉토리 확인 및 생성 (Git 클론 시 폴더 유실 방지)
  const requiredDirs = ['data', 'fonts', 'public/quotes'];
  requiredDirs.forEach(dir => {
    const dirPath = path.resolve(dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 생성됨 (유실 디렉토리): ${dir}`);
    }
  });

  // 1. 데이터베이스 초기화
  try {
    initDb();
  } catch (err) {
    console.error('❌ DB 초기화 실패:', err);
    process.exit(1);
  }

  // 2. Express 웹 서버 실행 (API & 웹 페이지 호스팅)
  try {
    initServer();
  } catch (err) {
    console.error('❌ 웹 서버 초기화 실패:', err);
    process.exit(1);
  }

  // 3. 디스코드 봇 클라이언트 로그인 및 대기
  try {
    initBot();
  } catch (err) {
    console.error('❌ 디스코드 봇 초기화 실패:', err);
  }
}

main();
