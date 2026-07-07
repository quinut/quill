import fs from 'fs';
import path from 'path';

const dirs = [
  'fonts',
  'public/quotes',
  'data',
  'src'
];

// 디렉토리 생성
console.log('디렉토리 생성 중...');
dirs.forEach(dir => {
  const dirPath = path.resolve(dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`생성됨: ${dir}`);
  } else {
    console.log(`이미 존재함: ${dir}`);
  }
});

// fetch를 이용한 파일 다운로드 (리다이렉션 자동 처리)
const downloadFile = async (url, dest) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get '${url}' (${response.status} ${response.statusText})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(dest, buffer);
  console.log(`다운로드 완료: ${path.basename(dest)}`);
};

const fonts = [
  {
    name: 'NanumMyeongjo.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/nanummyeongjo/NanumMyeongjo-Regular.ttf'
  },
  {
    name: 'NanumMyeongjo-Bold.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/nanummyeongjo/NanumMyeongjo-Bold.ttf'
  }
];

async function setup() {
  try {
    for (const font of fonts) {
      const dest = path.resolve('fonts', font.name);
      // 이미 받아진 파일이 있고 크기가 0이 아니면 스킵
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        console.log(`이미 존재함: ${font.name}`);
      } else {
        console.log(`${font.name} 다운로드 중...`);
        await downloadFile(font.url, dest);
      }
    }
    console.log('초기 설정 완료!');
  } catch (error) {
    console.error('설정 중 오류 발생:', error);
  }
}

setup();
