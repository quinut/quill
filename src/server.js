import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { getQuotes, searchQuotes } from './db.js';

let app;

export function initServer() {
  app = express();

  // 미들웨어
  app.use(cors());
  app.use(express.json());

  // 정적 파일 서빙 (public 디렉토리)
  // public/quotes 안의 생성된 이미지도 함께 서빙됨
  app.use(express.static(config.publicDir));

  // 명언 API 목록 조회
  app.get('/api/quotes', (req, res) => {
    try {
      const { search, guild_id } = req.query;

      let quotes;
      if (search) {
        quotes = searchQuotes(search, guild_id || null);
      } else {
        quotes = getQuotes(guild_id || null);
      }

      res.json({
        success: true,
        count: quotes.length,
        data: quotes
      });
    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({
        success: false,
        error: '서버 내부 오류가 발생했습니다.'
      });
    }
  });

  // 서버 시작
  app.listen(config.port, () => {
    console.log(`🏛️  Museum web server running at: http://localhost:${config.port}/`);
  });
}
