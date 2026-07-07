import { generateQuoteImage } from '../src/imageGenerator.js';
import { initDb, saveQuote } from '../src/db.js';
import fs from 'fs';
import path from 'path';

async function runTest() {
  console.log('Canvas 이미지 생성 테스트 시작...');
  
  // DB & 폴더 초기화
  initDb();

  const testParams = {
    id: 'test-quote-uuid',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
    content: '치킨은 살 안 쪄요. 살은 내가 쪄요.\n이것은 붓다가 한 말입니다. 아마도.',
    authorName: '안준혁',
    dateStr: '2026. 07. 07',
    contextStr: '치킨을 시키며 했던 말'
  };

  try {
    const resultPath = await generateQuoteImage(testParams);
    console.log('테스트 이미지 생성 성공!', resultPath);
    
    // DB 저장 테스트 (박물관 웹 사이트 테스트용 데이터 주입)
    saveQuote({
      id: testParams.id,
      messageId: 'test-msg-id',
      authorName: testParams.authorName,
      authorAvatarUrl: testParams.avatarUrl,
      content: testParams.content.replace(/\n/g, ' '),
      context: testParams.contextStr,
      imagePath: resultPath,
      guildId: 'test-guild-id',
      guildName: '개발팀 테스트 서버'
    });
    console.log('✅ 테스트 데이터를 DB에 성공적으로 저장했습니다.');
    
    // 파일 존재 여부 확인
    const fullPath = path.resolve('public', resultPath.replace(/^\//, ''));
    if (fs.existsSync(fullPath)) {
      console.log(`✅ 생성된 파일 확인됨: ${fullPath} (${fs.statSync(fullPath).size} bytes)`);
    } else {
      console.error(`❌ 생성된 파일이 해당 경로에 존재하지 않습니다: ${fullPath}`);
    }
  } catch (error) {
    console.error('❌ 테스트 이미지 생성 중 실패:', error);
  }
}

runTest();
