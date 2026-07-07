import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  port: parseInt(process.env.PORT || '3000', 10),
  emojis: (process.env.EMOJIS || '🏛️,📝').split(','),
  dbPath: path.resolve('data/database.db'),
  publicDir: path.resolve('public'),
  quotesDir: path.resolve('public/quotes'),
  fontsDir: path.resolve('fonts')
};

if (!config.discordToken) {
  console.warn('⚠️ WARNING: DISCORD_TOKEN이 .env 파일에 정의되지 않았습니다. 디스코드 봇이 정상적으로 작동하지 않을 수 있습니다.');
}
