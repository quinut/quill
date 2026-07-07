import { Client, GatewayIntentBits, Partials, AttachmentBuilder } from 'discord.js';
import crypto from 'crypto';
import path from 'path';
import { config } from './config.js';
import { saveQuote, getQuoteByMessageId } from './db.js';
import { generateQuoteImage } from './imageGenerator.js';

let client;

export function initBot() {
  if (!config.discordToken) {
    console.error('❌ DISCORD_TOKEN이 존재하지 않아 디스코드 봇을 초기화할 수 없습니다.');
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent
    ],
    partials: [
      Partials.Message,
      Partials.Reaction,
      Partials.User
    ]
  });

  client.once('ready', () => {
    console.log(`🤖 Discord Bot logged in as ${client.user.tag}`);
  });

  // 반응(이모지) 추가 감지
  client.on('messageReactionAdd', async (reaction, user) => {
    // 봇의 반응은 무시
    if (user.bot) return;

    // Partial 데이터 페칭
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Failed to fetch reaction:', error);
        return;
      }
    }

    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch (error) {
        console.error('Failed to fetch message:', error);
        return;
      }
    }

    const { message } = reaction;
    
    // 이모지가 타겟 이모지 리스트에 들어있는지 검사
    const emojiName = reaction.emoji.name;
    if (!config.emojis.includes(emojiName)) {
      return;
    }

    // 텍스트 내용이 없거나 빈 메시지(예: 이미지만 있는 메시지)면 스킵
    const messageContent = message.content?.trim();
    if (!messageContent) {
      return;
    }

    // 이미 박제된 메시지인지 체크
    const existingQuote = getQuoteByMessageId(message.id);
    if (existingQuote) {
      // 해당 메시지 채널에 이미 박제되었다고 짧게 언급 (채널 스레드를 혼란스럽게 하지 않기 위해 한번만 언급하거나 리액션만 다는 것도 좋음)
      try {
        await message.reply({ content: '🏛️ 이미 명언 박물관에 박제된 명언입니다!' });
      } catch (e) {
        console.error(e);
      }
      return;
    }

    console.log(`📝 명언 후보 감지: "${messageContent}" by ${message.author.tag}`);

    // 맥락(상황) 수집 단계
    let contextStr = '단톡방에서 잡담을 나누며';
    
    try {
      // 1. 안내 메시지 전송
      const promptMsg = await message.reply({
        content: `🏛️ **'아웃 오브 콘텍스트' 명언 짤 제조기**\n${user}님, 이 명언이 탄생하게 된 **당시 상황(맥락)**을 1분 내에 짧은 텍스트로 답장해 주세요!\n*(예: 치킨을 시키며, 게임에서 지고 나서)*\n*(아무것도 입력하지 않거나 1분이 지나면 기본값으로 기록됩니다.)*`
      });

      // 2. Message Collector 생성 (반응을 단 사용자의 다음 입력 대기)
      const filter = m => m.author.id === user.id;
      const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });

      await new Promise((resolve) => {
        collector.on('collect', async (collectedMsg) => {
          const answer = collectedMsg.content?.trim();
          if (answer) {
            contextStr = answer;
            // "치킨을 시키며 했던 말" 처럼 조사를 붙여 명언집스럽게 다듬어줍니다.
            if (!contextStr.endsWith('말') && !contextStr.endsWith('때') && !contextStr.endsWith('에서') && !contextStr.endsWith('하며')) {
              contextStr = `${contextStr} 했던 말`;
            }
          }
          
          // 사용자가 남긴 응답 메시지 삭제 (대화창을 깨끗하게 유지하기 위해)
          try {
            await collectedMsg.delete();
          } catch (e) {
            // 권한 부족 등으로 실패해도 진행
          }
          resolve();
        });

        collector.on('end', () => {
          resolve();
        });
      });

      // 3. 안내 프롬프트 메시지 수정 (진행 중 표시)
      await promptMsg.edit({ content: '🎨 명언 이미지를 최고급 퀄리티로 제조하는 중입니다...' });

      // 4. 이미지 생성 매개변수 준비
      const id = crypto.randomUUID();
      const authorName = message.member?.displayName || message.author.username;
      const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 });
      
      // 날짜 포맷팅
      const date = message.createdAt;
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}. ${mm}. ${dd}`;

      // 5. 이미지 생성 실행
      const relativeImagePath = await generateQuoteImage({
        id,
        avatarUrl,
        content: messageContent,
        authorName,
        dateStr,
        contextStr
      });

      // 6. DB 저장
      saveQuote({
        id,
        messageId: message.id,
        authorName,
        authorAvatarUrl: avatarUrl,
        content: messageContent,
        context: contextStr,
        imagePath: relativeImagePath,
        guildId: message.guildId,
        guildName: message.guild?.name || 'DM'
      });

      // 7. 채널에 명언 업로드
      const imageFullPath = path.resolve('public', relativeImagePath.replace(/^\//, ''));
      const attachment = new AttachmentBuilder(imageFullPath, { name: `${id}.png` });

      // 박제 완료 메시지 전송
      await promptMsg.delete(); // 안내 메시지 삭제

      const museumLink = `http://localhost:${config.port}/`; // 로컬 museum 호스트 링크
      await message.reply({
        content: `✨ **역사적인 명언이 탄생했습니다!**\n[- ${authorName} (${dateStr}), ${contextStr}]\n\n🏛️ 전체 명언은 [명언 박물관](${museumLink})에서 감상하실 수 있습니다.`,
        files: [attachment]
      });

      console.log(`✅ 명언 박제 완료! ID: ${id}`);
    } catch (err) {
      console.error('명언 짤 생성/전송 중 에러 발생:', err);
      try {
        await message.reply({ content: '❌ 명언 이미지를 제조하는 중 오류가 발생했습니다.' });
      } catch (e) {}
    }
  });

  client.login(config.discordToken).catch(err => {
    console.error('❌ Discord client login failed:', err);
  });
}
