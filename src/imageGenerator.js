import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

// 폰트 등록
const regularFontPath = path.join(config.fontsDir, 'NanumMyeongjo.ttf');
const boldFontPath = path.join(config.fontsDir, 'NanumMyeongjo-Bold.ttf');

let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;
  
  if (fs.existsSync(regularFontPath)) {
    GlobalFonts.registerFromPath(regularFontPath, 'NanumMyeongjo');
    console.log('Registered NanumMyeongjo Regular font.');
  } else {
    console.warn(`⚠️ Regular font not found at ${regularFontPath}. Fallback fonts will be used.`);
  }

  if (fs.existsSync(boldFontPath)) {
    GlobalFonts.registerFromPath(boldFontPath, 'NanumMyeongjo-Bold');
    console.log('Registered NanumMyeongjo Bold font.');
  } else {
    console.warn(`⚠️ Bold font not found at ${boldFontPath}. Fallback fonts will be used.`);
  }

  fontsRegistered = true;
}

// 텍스트 줄바꿈 함수
function wrapText(ctx, text, maxWidth) {
  const words = text.split('');
  let lines = [];
  let currentLine = '';

  for (let n = 0; n < words.length; n++) {
    let testLine = currentLine + words[n];
    let metrics = ctx.measureText(testLine);
    let testWidth = metrics.width;
    
    // 강제 줄바꿈(\n) 처리
    if (words[n] === '\n') {
      lines.push(currentLine);
      currentLine = '';
      continue;
    }

    if (testWidth > maxWidth && n > 0) {
      lines.push(currentLine);
      currentLine = words[n];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines.filter(line => line.trim() !== '');
}

/**
 * 명언 짤 이미지를 생성하여 저장합니다.
 * @param {Object} params
 * @param {string} params.id - 명언 고유 ID (UUID)
 * @param {string} params.avatarUrl - 프로필 이미지 URL
 * @param {string} params.content - 명언 내용
 * @param {string} params.authorName - 말한 사람 이름
 * @param {string} params.dateStr - 날짜 (YYYY. MM. DD)
 * @param {string} params.contextStr - 당시 상황
 * @returns {Promise<string>} - 저장된 이미지 파일의 상대 경로
 */
export async function generateQuoteImage({ id, avatarUrl, content, authorName, dateStr, contextStr }) {
  registerFonts();

  const width = 800;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. 배경 그라데이션 (매우 짙은 챠콜 ~ 블랙)
  const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 500);
  grad.addColorStop(0, '#1c1c1e');
  grad.addColorStop(1, '#09090b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. 클래식하고 얇은 금빛 테두리선 및 모서리 장식
  ctx.strokeStyle = 'rgba(197, 168, 128, 0.4)'; // 부드러운 골드 톤
  ctx.lineWidth = 1.5;
  
  const margin = 25;
  ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

  // 모서리 장식용 내부 프레임
  const innerMargin = 32;
  ctx.strokeStyle = 'rgba(197, 168, 128, 0.2)';
  ctx.strokeRect(innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2);

  // 3. 디스코드 프로필 아바타 획득 및 그리기
  let avatarImg = null;
  if (avatarUrl) {
    try {
      const response = await fetch(avatarUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        avatarImg = await loadImage(Buffer.from(buffer));
      }
    } catch (err) {
      console.error('Failed to load avatar image:', err);
    }
  }

  const avatarX = width / 2;
  const avatarY = 100;
  const avatarSize = 80;
  const avatarRadius = avatarSize / 2;

  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarSize, avatarSize);
    ctx.restore();

    // 아바타 테두리 골드 링
    ctx.strokeStyle = 'rgba(197, 168, 128, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 2, 0, Math.PI * 2, true);
    ctx.stroke();
  } else {
    // 아바타 로드 실패 시 기본 원형 장식
    ctx.fillStyle = 'rgba(197, 168, 128, 0.1)';
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.strokeStyle = 'rgba(197, 168, 128, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 4. 명언 텍스트 배치
  // 텍스트 글꼴 및 사이즈 동적 조정
  let fontSize = 26;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // 텍스트 감싸기 테스트 후 너무 길면 폰트 축소
  let wrappedLines = [];
  const maxWidth = 560;
  
  do {
    ctx.font = `${fontSize}px "NanumMyeongjo", "Georgia", "serif"`;
    wrappedLines = wrapText(ctx, `“ ${content} ”`, maxWidth);
    
    // 줄 수가 너무 많아 화면을 벗어날 것 같으면 폰트 크기 축소
    if (wrappedLines.length * (fontSize * 1.5) > 180) {
      fontSize -= 2;
    } else {
      break;
    }
  } while (fontSize > 16);

  ctx.fillStyle = '#f4f4f5'; // 부드러운 화이트
  const startY = 240 - ((wrappedLines.length - 1) * (fontSize * 1.5)) / 2;
  
  for (let i = 0; i < wrappedLines.length; i++) {
    const lineY = startY + i * (fontSize * 1.5);
    ctx.fillText(wrappedLines[i], width / 2, lineY);
  }

  // 5. 하단 서명 (이름, 날짜, 상황)
  ctx.font = '15px "NanumMyeongjo-Bold", "NanumMyeongjo", "Georgia", "serif"';
  ctx.fillStyle = '#c5a880'; // 시그니처 골드
  
  // 형식: [- 이름 (YYYY. MM. DD), 상황]
  const signatureText = `[- ${authorName} (${dateStr}), ${contextStr}]`;
  
  // 하단 장식선
  const sigY = 410;
  ctx.fillText(signatureText, width / 2, sigY);
  
  ctx.strokeStyle = 'rgba(197, 168, 128, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 80, sigY - 20);
  ctx.lineTo(width / 2 + 80, sigY - 20);
  ctx.stroke();

  // 6. 이미지 저장
  const fileName = `${id}.png`;
  const relativePath = `/quotes/${fileName}`;
  const savePath = path.join(config.quotesDir, fileName);
  
  const buffer = await canvas.toBuffer('image/png');
  await fs.promises.writeFile(savePath, buffer);
  
  console.log(`Quote image generated and saved to: ${savePath}`);
  return relativePath;
}
