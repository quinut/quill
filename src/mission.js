import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ApplicationCommandOptionType
} from 'discord.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  getUser,
  createMission,
  getMission,
  joinMission,
  quitMission,
  getParticipants,
  isParticipant,
  getJoinedActiveMissions,
  createSubmission,
  getSubmission,
  getPendingSubmissionForUser,
  getPendingSubmissions,
  updateSubmissionStatus,
  voteSubmission,
  getVotes,
  getLeaderboard,
  getWeeklyUserStats,
  updateMissionStatus,
  addUserPoints,
  getRecentSubmissionChannels,
  getActiveMissions
} from './missionDb.js';
import { checkAndUnlockAchievements } from './achievement.js';

// 디자인 색상 코드 (Hex)
const COLOR_GOLD = 0xC5A880;
const COLOR_YELLOW = 0xF1C40F;
const COLOR_GREEN = 0x2ECC71;
const COLOR_RED = 0xE74C3C;
const COLOR_SLATE = 0x34495E;

// 활성화된 타이머 캐시 (메모리 내)
const activeTimers = new Map();

/**
 * 미션 시스템 초기화
 */
export function initMissions(client) {
  client.on('ready', async () => {
    try {
      const commands = [
        {
          name: '미션생성',
          description: '새로운 실생활 미션을 개설합니다.',
        },
        {
          name: '인증',
          description: '참가 중인 미션에 대한 인증 사진이나 글을 제출합니다.',
          options: [
            {
              name: '미션',
              description: '인증할 미션을 선택하세요.',
              type: ApplicationCommandOptionType.String,
              required: true,
              autocomplete: true
            },
            {
              name: '첨부파일',
              description: '사진 또는 동영상 인증 파일',
              type: ApplicationCommandOptionType.Attachment,
              required: false
            },
            {
              name: '내용',
              description: '인증 설명 또는 이미지/동영상 링크',
              type: ApplicationCommandOptionType.String,
              required: false
            }
          ]
        },
        {
          name: '랭킹',
          description: '서버 유저들의 누적 포인트 및 미션 성공 횟수 순위를 확인합니다.',
        }
      ];

      // 글로벌 커맨드는 비웁니다 (길드 전용 커맨드와의 중복 노출 방지)
      await client.application.commands.set([]);
      console.log('✅ 글로벌 슬래시 커맨드 제거 완료 (중복 노출 방지).');

      // 캐시된 모든 길드에도 즉시 등록하여 실시간 테스트 지원
      const guilds = client.guilds.cache;
      for (const [guildId, guild] of guilds) {
        try {
          await guild.commands.set(commands);
          console.log(`✅ 길드 전용 슬래시 커맨드 등록 완료: ${guild.name} (${guildId})`);
        } catch (guildErr) {
          console.warn(`⚠️ 길드 (${guild.name}) 커맨드 등록 실패 (권한 부족 등):`, guildErr.message);
        }
      }

      // 미결된 청문회 타이머 재개
      resumePendingHearings(client);

      // 주간 나태지옥 스케줄러 기동
      startWeeklySlackerScheduler(client);
    } catch (err) {
      console.error('❌ 미션 커맨드 등록 오류:', err);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      console.log(`[Interaction] Received: type=${interaction.type}, isAutocomplete=${interaction.isAutocomplete()}, isCommand=${interaction.isChatInputCommand()}, user=${interaction.user.tag}`);
      if (interaction.isChatInputCommand()) {
        await handleChatInputCommand(interaction);
      } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
      }
    } catch (err) {
      console.error('❌ 미션 인터랙션 오류:', err);
      try {
        const errorMsg = '❌ 처리 중 내부 오류가 발생했습니다.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMsg, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMsg, ephemeral: true });
        }
      } catch (e) { }
    }
  });
}

/**
 * 슬래시 커맨드 처리
 */
async function handleChatInputCommand(interaction) {
  const { commandName } = interaction;

  if (commandName === '미션생성') {
    // 미션 생성 모달 띄우기
    const modal = new ModalBuilder()
      .setCustomId('mission_create_modal')
      .setTitle('미션 생성');

    const titleInput = new TextInputBuilder()
      .setCustomId('mission_title')
      .setLabel('미션 제목')
      .setPlaceholder('예: 아침 7시 기상 인증하기')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const descInput = new TextInputBuilder()
      .setCustomId('mission_desc')
      .setLabel('미션 상세 내용 및 인증 조건')
      .setPlaceholder('예: 7시 정각 전에 이불 밖 발 사진을 찍어서 업로드해야 함.')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    const pointsInput = new TextInputBuilder()
      .setCustomId('mission_points')
      .setLabel('보상 포인트 (P)')
      .setPlaceholder('예: 100 (숫자만 입력)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(pointsInput)
    );

    await interaction.showModal(modal);
  }

  else if (commandName === '인증') {
    const missionId = interaction.options.getString('미션');
    const attachment = interaction.options.getAttachment('첨부파일');
    const proofText = interaction.options.getString('내용');

    // 미션 유효성 검사
    const mission = getMission(missionId);
    if (!mission) {
      return interaction.reply({ content: '❌ 올바르지 않은 미션입니다. 목록에서 선택해 주세요.', ephemeral: true });
    }

    // 참가 상태 검사
    const participating = isParticipant(missionId, interaction.user.id);
    if (!participating) {
      return interaction.reply({
        content: '❌ 이 미션의 참가자가 아닙니다! 미션 카드 하단의 `[참가하기]` 버튼을 먼저 눌러주세요.',
        ephemeral: true
      });
    }

    // 펜딩 인증 유무 검사
    const existingPending = getPendingSubmissionForUser(missionId, interaction.user.id);
    if (existingPending) {
      return interaction.reply({
        content: '❌ 이미 이 미션에 대해 승인 대기 중인 인증 청문회가 존재합니다. 판정이 완료된 뒤 다시 시도해 주세요.',
        ephemeral: true
      });
    }

    // 최소 설명이나 첨부파일 중 하나 필수
    if (!attachment && !proofText) {
      return interaction.reply({
        content: '❌ 사진/동영상 첨부파일 또는 설명 내용 중 최소 하나는 업로드해야 합니다.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // 인증 데이터 저장 및 청문회 시작
    const submissionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1시간 후
    const proofUrl = attachment ? attachment.url : (proofText.startsWith('http') ? proofText : null);

    // 청문회 임베드 빌드
    const userMention = `<@${interaction.user.id}>`;
    const embed = new EmbedBuilder()
      .setTitle(`📢 [인증 청문회] ${interaction.member?.displayName || interaction.user.username} 의 "${mission.title}"`)
      .setColor(COLOR_YELLOW)
      .addFields(
        { name: '🎯 미션 정보', value: `**${mission.title}** (${mission.reward_points}P)` },
        { name: '📝 상세 설명', value: mission.description },
        { name: '🙋 제출자', value: userMention },
        { name: '⚖️ 판결 투표 현황', value: '🔴 인정: `0표` | 🔵 지랄ㄴㄴ: `0표` (과반수 이상 인정 시 획득)' },
        { name: '⏳ 판결 마감', value: `마감 시각: <t:${Math.floor(Date.parse(expiresAt) / 1000)}:R>` }
      )
      .setFooter({ text: '배심원 투표를 기다리고 있습니다. (제한시간 1시간)' });

    if (proofUrl) {
      embed.setImage(proofUrl);
    }
    if (proofText && !proofText.startsWith('http')) {
      embed.addFields({ name: '💬 제출자 한마디', value: proofText });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_pass_${submissionId}`)
        .setLabel('인정 (Pass)')
        .setStyle(ButtonStyle.Danger), // 🔴 빨간색
      new ButtonBuilder()
        .setCustomId(`vote_fail_${submissionId}`)
        .setLabel('지랄ㄴㄴ (Fail)')
        .setStyle(ButtonStyle.Primary) // 🔵 파란색
    );

    // 채널에 청문회 카드 전송
    const channel = interaction.channel;
    const message = await channel.send({ embeds: [embed], components: [row] });

    // DB 등록
    createSubmission({
      id: submissionId,
      missionId,
      userId: interaction.user.id,
      proofText: proofText && !proofText.startsWith('http') ? proofText : null,
      proofUrl,
      expiresAt,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: message.id
    });

    // 1시간 타이머 구동
    const timeout = setTimeout(() => {
      concludeHearing(interaction.client, submissionId);
    }, 60 * 60 * 1000);
    activeTimers.set(submissionId, timeout);

    await interaction.editReply({ content: '✅ 인증 제출 및 청문회가 시작되었습니다! 채널에 전송된 카드를 확인하세요.' });
  }

  else if (commandName === '랭킹') {
    const leaderboard = getLeaderboard();

    if (leaderboard.length === 0) {
      return interaction.reply({ content: '📊 아직 등록된 랭킹 데이터가 없습니다. 미션을 달성해 보세요!', ephemeral: false });
    }

    const embed = new EmbedBuilder()
      .setTitle('🏆 미션 헌터 명예의 전당')
      .setColor(COLOR_SLATE)
      .setDescription('서버 내 멤버들의 누적 포인트 및 성공 횟수 순위입니다.\n\n**[업적 뱃지 안내]**\n🏆 첫걸음 | ⚡ 독종 | 🤝 마당발 | 🧱 철벽\n──────────────────')
      .setTimestamp();

    let rankingText = '';
    leaderboard.slice(0, 10).forEach((user, index) => {
      let medal = '🎖️';
      if (index === 0) medal = '🥇';
      else if (index === 1) medal = '🥈';
      else if (index === 2) medal = '🥉';

      // 뱃지 파싱
      const achievements = JSON.parse(user.achievements_list || '[]');
      const badges = [];
      if (achievements.includes('first_step')) badges.push('🏆');
      if (achievements.includes('relentless')) badges.push('⚡');
      if (achievements.includes('social_butterfly')) badges.push('🤝');
      if (achievements.includes('iron_wall')) badges.push('🧱');

      const badgeStr = badges.length > 0 ? ` ${badges.join('')}` : '';
      rankingText += `${medal} **${index + 1}위** | <@${user.discord_id}>: **${user.points}P** (${user.success_count}회 성공)${badgeStr}\n`;
    });

    embed.addFields({ name: '📊 TOP 10 랭킹', value: rankingText });

    await interaction.reply({ embeds: [embed] });
  }
}

/**
 * Autocomplete 처리
 */
async function handleAutocomplete(interaction) {
  try {
    const focusedOption = interaction.options.getFocused(true);
    console.log(`[Autocomplete] focusedOption: name=${focusedOption.name}, value=${focusedOption.value}`);

    if (focusedOption.name === '미션') {
      const activeMissions = getJoinedActiveMissions(interaction.user.id);
      console.log(`[Autocomplete] Total joined active missions found in DB for user ${interaction.user.id}: ${activeMissions.length}`);
      
      const filtered = activeMissions.filter(m => m.title.toLowerCase().includes(focusedOption.value.toLowerCase()));
      console.log(`[Autocomplete] Filtered missions count: ${filtered.length}`);

      const choices = filtered.slice(0, 25).map(m => ({
        name: `${m.title} (${m.reward_points}P)`,
        value: m.id
      }));
      console.log(`[Autocomplete] Sending choices: ${JSON.stringify(choices)}`);

      await interaction.respond(choices);
      console.log(`[Autocomplete] Sent respond successfully.`);
    }
  } catch (err) {
    console.error(`[Autocomplete] Error inside handleAutocomplete:`, err);
    throw err;
  }
}

/**
 * 버튼 인터랙션 처리
 */
async function handleButtonInteraction(interaction) {
  const { customId } = interaction;

  // 1. 미션 참가
  if (customId.startsWith('mission_join_')) {
    const missionId = customId.replace('mission_join_', '');
    const joined = joinMission(missionId, interaction.user.id);

    if (!joined) {
      return interaction.reply({ content: 'ℹ️ 이미 참가 등록된 미션입니다.', ephemeral: true });
    }

    await updateMissionCard(interaction.message, missionId);
    await interaction.reply({ content: '✅ 미션 참가 신청이 완료되었습니다! 미션을 완료하고 `/인증`을 해주세요.', ephemeral: true });
  }

  // 2. 미션 포기
  else if (customId.startsWith('mission_quit_')) {
    const missionId = customId.replace('mission_quit_', '');
    const quit = quitMission(missionId, interaction.user.id);

    if (!quit) {
      return interaction.reply({ content: 'ℹ️ 참가 중인 미션이 아닙니다.', ephemeral: true });
    }

    await updateMissionCard(interaction.message, missionId);
    await interaction.reply({ content: '🔴 미션 참가를 취소하였습니다.', ephemeral: true });
  }

  // 3. 인증하기 단축 버튼 클릭
  else if (customId.startsWith('mission_submit_')) {
    const missionId = customId.replace('mission_submit_', '');
    const mission = getMission(missionId);

    if (!mission) {
      return interaction.reply({ content: '❌ 존재하지 않는 미션입니다.', ephemeral: true });
    }

    const participating = isParticipant(missionId, interaction.user.id);
    if (!participating) {
      return interaction.reply({
        content: '❌ 참가 중인 멤버만 인증을 제출할 수 있습니다! 먼저 `[참가하기]` 버튼을 클릭해 주세요.',
        ephemeral: true
      });
    }

    // 펜딩 인증 유무 검사
    const existingPending = getPendingSubmissionForUser(missionId, interaction.user.id);
    if (existingPending) {
      return interaction.reply({
        content: '❌ 이미 이 미션에 대해 승인 대기 중인 인증 청문회가 존재합니다. 판정이 완료된 뒤 다시 시도해 주세요.',
        ephemeral: true
      });
    }

    // 모달창 띄우기 (텍스트/링크 전용)
    const modal = new ModalBuilder()
      .setCustomId(`mission_submit_modal_${missionId}`)
      .setTitle('미션 인증 제출');

    const proofInput = new TextInputBuilder()
      .setCustomId('submission_proof')
      .setLabel('인증 글 또는 이미지/동영상 링크 입력')
      .setPlaceholder('예: 7시 정각 기상 완료! 이미지 링크: https://...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(proofInput));
    await interaction.showModal(modal);
  }

  // 4. 청문회 인정 (Pass)
  else if (customId.startsWith('vote_pass_')) {
    const submissionId = customId.replace('vote_pass_', '');
    const submission = getSubmission(submissionId);

    if (!submission) {
      return interaction.reply({ content: '❌ 존재하지 않는 청문회입니다.', ephemeral: true });
    }

    if (submission.status !== 'pending') {
      return interaction.reply({ content: '❌ 이미 판정이 종료된 청문회입니다.', ephemeral: true });
    }

    if (submission.user_id === interaction.user.id) {
      return interaction.reply({ content: '✋ 본인 인증글에는 투표할 수 없습니다. 친구들의 판정을 기다려주세요!', ephemeral: true });
    }

    // 투표 기록
    voteSubmission({
      submissionId,
      voterId: interaction.user.id,
      voteType: 'pass'
    });
    // 만약 만료 시각이 지난 상태에서 첫 투표가 이루어졌다면 즉시 판결 진행
    const isExpired = Date.now() > new Date(submission.expires_at).getTime();
    if (isExpired) {
      await concludeHearing(interaction.client, submissionId);
    } else {
      await updateHearingCard(interaction.client, submissionId);
    }
    await interaction.reply({ content: '🔴 [인정] 투표가 정상 반영되었습니다!', ephemeral: true });
  }

  // 5. 청문회 지랄ㄴㄴ (Fail)
  else if (customId.startsWith('vote_fail_')) {
    const submissionId = customId.replace('vote_fail_', '');
    const submission = getSubmission(submissionId);

    if (!submission) {
      return interaction.reply({ content: '❌ 존재하지 않는 청문회입니다.', ephemeral: true });
    }

    if (submission.status !== 'pending') {
      return interaction.reply({ content: '❌ 이미 판정이 종료된 청문회입니다.', ephemeral: true });
    }

    if (submission.user_id === interaction.user.id) {
      return interaction.reply({ content: '✋ 본인 인증글에는 투표할 수 없습니다. 친구들의 판정을 기다려주세요!', ephemeral: true });
    }

    // 사유 작성을 위한 모달창 호출
    const modal = new ModalBuilder()
      .setCustomId(`vote_fail_modal_${submissionId}`)
      .setTitle('지랄ㄴㄴ 거절 사유 입력');

    const commentInput = new TextInputBuilder()
      .setCustomId('vote_fail_comment')
      .setLabel('왜 불합격인가요? (한마디)')
      .setPlaceholder('예: 해가 중천에 떴구만 무슨 기상인증임')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
    await interaction.showModal(modal);
  }
}

/**
 * 모달 제출 처리
 */
async function handleModalSubmit(interaction) {
  const { customId } = interaction;

  // 1. 미션 생성 완료
  if (customId === 'mission_create_modal') {
    const title = interaction.fields.getTextInputValue('mission_title');
    const description = interaction.fields.getTextInputValue('mission_desc');
    const pointsStr = interaction.fields.getTextInputValue('mission_points');

    const points = parseInt(pointsStr, 10);
    if (isNaN(points) || points <= 0) {
      return interaction.reply({ content: '❌ 보상 포인트는 올바른 양의 정수(숫자)여야 합니다.', ephemeral: true });
    }

    const missionId = crypto.randomUUID();
    createMission({
      id: missionId,
      creatorId: interaction.user.id,
      title,
      description,
      rewardPoints: points
    });

    // 채널에 미션 임베드 전송
    const embed = new EmbedBuilder()
      .setTitle(`🏆 신규 미션: ${title}`)
      .setColor(COLOR_GOLD)
      .setDescription(description)
      .addFields(
        { name: '💰 보상 포인트', value: `**${points} P**`, inline: true },
        { name: '👑 개설자', value: `<@${interaction.user.id}>`, inline: true },
        { name: '👥 현재 참가 멤버 (0명)', value: '*아직 참가자가 없습니다. 첫 주자가 되어보세요!*' }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mission_join_${missionId}`)
        .setLabel('참가하기 (0)')
        .setStyle(ButtonStyle.Success), // 🟢 녹색
      new ButtonBuilder()
        .setCustomId(`mission_quit_${missionId}`)
        .setLabel('미션 포기')
        .setStyle(ButtonStyle.Secondary), // 🔘 회색
      new ButtonBuilder()
        .setCustomId(`mission_submit_${missionId}`)
        .setLabel('인증하기')
        .setStyle(ButtonStyle.Primary) // 🔵 파란색
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ 미션 카드가 성공적으로 채널에 업로드되었습니다!', ephemeral: true });
  }

  // 2. 단축 버튼을 통한 인증 완료
  else if (customId.startsWith('mission_submit_modal_')) {
    const missionId = customId.replace('mission_submit_modal_', '');
    const proofText = interaction.fields.getTextInputValue('submission_proof');

    const mission = getMission(missionId);
    if (!mission) {
      return interaction.reply({ content: '❌ 존재하지 않는 미션입니다.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // 인증 데이터 저장 및 청문회 시작
    const submissionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1시간 후
    const proofUrl = proofText.startsWith('http') ? proofText : null;

    const embed = new EmbedBuilder()
      .setTitle(`📢 [인증 청문회] ${interaction.member?.displayName || interaction.user.username} 의 "${mission.title}"`)
      .setColor(COLOR_YELLOW)
      .addFields(
        { name: '🎯 미션 정보', value: `**${mission.title}** (${mission.reward_points}P)` },
        { name: '📝 상세 설명', value: mission.description },
        { name: '🙋 제출자', value: `<@${interaction.user.id}>` },
        { name: '⚖️ 판결 투표 현황', value: '🔴 인정: `0표` | 🔵 지랄ㄴㄴ: `0표` (과반수 이상 인정 시 획득)' },
        { name: '⏳ 판결 마감', value: `마감 시각: <t:${Math.floor(Date.parse(expiresAt) / 1000)}:R>` }
      )
      .setFooter({ text: '배심원 투표를 기다리고 있습니다. (제한시간 1시간)' });

    if (proofUrl) {
      embed.setImage(proofUrl);
    }
    if (proofText && !proofText.startsWith('http')) {
      embed.addFields({ name: '💬 제출자 한마디', value: proofText });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_pass_${submissionId}`)
        .setLabel('인정 (Pass)')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`vote_fail_${submissionId}`)
        .setLabel('지랄ㄴㄴ (Fail)')
        .setStyle(ButtonStyle.Primary)
    );

    const message = await interaction.channel.send({ embeds: [embed], components: [row] });

    createSubmission({
      id: submissionId,
      missionId,
      userId: interaction.user.id,
      proofText: proofText && !proofText.startsWith('http') ? proofText : null,
      proofUrl,
      expiresAt,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: message.id
    });

    const timeout = setTimeout(() => {
      concludeHearing(interaction.client, submissionId);
    }, 60 * 60 * 1000);
    activeTimers.set(submissionId, timeout);

    await interaction.editReply({ content: '✅ 인증 제출 및 청문회가 시작되었습니다! 채널에 전송된 카드를 확인하세요.' });
  }

  // 3. 지랄ㄴㄴ 사유 제출
  else if (customId.startsWith('vote_fail_modal_')) {
    const submissionId = customId.replace('vote_fail_modal_', '');
    const comment = interaction.fields.getTextInputValue('vote_fail_comment');

    voteSubmission({
      submissionId,
      voterId: interaction.user.id,
      voteType: 'fail',
      comment
    });

    const submission = getSubmission(submissionId);
    const isExpired = submission && (Date.now() > new Date(submission.expires_at).getTime());
    if (isExpired) {
      await concludeHearing(interaction.client, submissionId);
    } else {
      await updateHearingCard(interaction.client, submissionId);
    }
    await interaction.reply({ content: '🔵 [지랄ㄴㄴ] 투표와 한마디 사유가 반영되었습니다!', ephemeral: true });
  }
}

/**
 * 미션 생성 카드 뷰 업데이트 헬퍼
 */
async function updateMissionCard(message, missionId) {
  const mission = getMission(missionId);
  const participants = getParticipants(missionId);

  const embed = EmbedBuilder.from(message.embeds[0]);

  // 참가자 목록 필드 업데이트
  let participantListText = '*아직 참가자가 없습니다. 첫 주자가 되어보세요!*';
  if (participants.length > 0) {
    participantListText = participants.map(p => `<@${p.user_id}>`).join(', ');
  }

  embed.setFields(
    { name: '💰 보상 포인트', value: `**${mission.reward_points} P**`, inline: true },
    { name: '👑 개설자', value: `<@${mission.creator_id}>`, inline: true },
    { name: '👥 현재 참가 멤버 (' + participants.length + '명)', value: participantListText }
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mission_join_${missionId}`)
      .setLabel(`참가하기 (${participants.length})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mission_quit_${missionId}`)
      .setLabel('미션 포기')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`mission_submit_${missionId}`)
      .setLabel('인증하기')
      .setStyle(ButtonStyle.Primary)
  );

  await message.edit({ embeds: [embed], components: [row] });
}

/**
 * 청문회 대기중인 투표 현황 텍스트 실시간 갱신 헬퍼
 */
async function updateHearingCard(client, submissionId) {
  try {
    const submission = getSubmission(submissionId);
    if (!submission) return;

    const votes = getVotes(submissionId);
    const passCount = votes.filter(v => v.vote_type === 'pass').length;
    const failCount = votes.filter(v => v.vote_type === 'fail').length;

    const channel = await client.channels.fetch(submission.channel_id);
    if (!channel) return;

    const message = await channel.messages.fetch(submission.message_id);
    if (!message) return;

    const embed = EmbedBuilder.from(message.embeds[0]);

    // 투표 현황 필드 찾기 및 업데이트
    const fields = embed.data.fields.map(f => {
      if (f.name === '⚖️ 판결 투표 현황') {
        return {
          name: '⚖️ 판결 투표 현황',
          value: `🔴 인정: \`${passCount}표\` | 🔵 지랄ㄴㄴ: \`${failCount}표\` (과반수 이상 인정 시 획득)`
        };
      }
      return f;
    });

    embed.setFields(fields);
    await message.edit({ embeds: [embed] });
  } catch (err) {
    console.error('❌ 청문회 카드 업데이트 중 오류:', err);
  }
}

/**
 * 청문회 투표 자동/수동 마감 처리
 */
export async function concludeHearing(client, submissionId) {
  try {
    // 만약 타이머 맵에 있다면 삭제
    if (activeTimers.has(submissionId)) {
      clearTimeout(activeTimers.get(submissionId));
      activeTimers.delete(submissionId);
    }

    const submission = getSubmission(submissionId);
    if (!submission || submission.status !== 'pending') return;

    const mission = getMission(submission.mission_id);
    if (!mission) return;

    const votes = getVotes(submissionId);
    
    // 최소 투표제 도입: 투표수가 0개이면 판결 유예 (대기 상태로 유지)
    if (votes.length === 0) {
      const channel = await client.channels.fetch(submission.channel_id);
      if (channel) {
        const message = await channel.messages.fetch(submission.message_id).catch(() => null);
        if (message) {
          const embed = EmbedBuilder.from(message.embeds[0]);
          embed.setFooter({ text: '⏳ 투표 참여 부족으로 대기 중... (최소 1표 필요)' });
          await message.edit({ embeds: [embed] });
        }
      }
      console.log(`[concludeHearing] 판결 유예: 투표가 0표입니다. (ID: ${submissionId})`);
      return;
    }

    const passCount = votes.filter(v => v.vote_type === 'pass').length;
    const failCount = votes.filter(v => v.vote_type === 'fail').length;

    const channel = await client.channels.fetch(submission.channel_id);
    if (!channel) return;

    const message = await channel.messages.fetch(submission.message_id);
    if (!message) return;

    const embed = EmbedBuilder.from(message.embeds[0]);
    let outcomePass = false;

    // 투표 결과 판정 (Pass > Fail 이고 최소 1표 이상이어야 함. 0대0 이면 Fail 처리)
    if (passCount > failCount) {
      outcomePass = true;
    }

    if (outcomePass) {
      // 1. 성공 처리
      updateSubmissionStatus(submissionId, 'pass');
      addUserPoints(submission.user_id, mission.reward_points);

      // 성공 임베드 업데이트
      embed
        .setColor(COLOR_GREEN)
        .setTitle(`✅ [청문회 가결] ${embed.data.title.replace('📢 [인증 청문회] ', '')}`)
        .setFields(
          { name: '🎯 미션 정보', value: `**${mission.title}** (${mission.reward_points}P)` },
          { name: '⚖️ 판결 결과', value: `🎉 **통과** (🔴 인정: \`${passCount}표\` vs 🔵 지랄ㄴㄴ: \`${failCount}표\`)` },
          { name: '🙋 완료자', value: `<@${submission.user_id}>` },
          { name: '💰 보상 지급', value: `**+${mission.reward_points} P** 완료 축하드립니다!` }
        )
        .setFooter({ text: '판결이 마감되었습니다.' });

      await message.edit({ embeds: [embed], components: [] });
      await channel.send(`🎉 **인증 성공!** <@${submission.user_id}> 님이 "${mission.title}" 미션을 통과하여 **${mission.reward_points}P**를 획득했습니다!`);

      // 업적 해금 검사
      const newlyUnlocked = checkAndUnlockAchievements(submission.user_id);
      for (const ach of newlyUnlocked) {
        const achEmbed = new EmbedBuilder()
          .setTitle(`🌟 희귀 업적 해금!`)
          .setColor(COLOR_GOLD)
          .setDescription(`<@${submission.user_id}> 님이 **[${ach.name}]** 업적을 달성하셨습니다!`)
          .addFields(
            { name: '📝 업적 조건', value: ach.description },
            { name: '🎁 해금 보상', value: `**+${ach.bonusPoints} P**` }
          )
          .setTimestamp();

        await channel.send({ embeds: [achEmbed] });
      }

      // 미션 완료했으므로 미션 상태도 'closed'로 변경? MVP 스펙상 미션은 그대로 두고, 참가자들이 다중 인증을 하거나 한 번 클리어하고 끝낼 수 있도록 유지.
      // 본 MVP에서는 미션 카드는 영구히 남아있고 다른 사람도 시도할 수 있도록 상태를 바꾸지 않음.

    } else {
      // 2. 실패 처리
      updateSubmissionStatus(submissionId, 'fail');

      // 실패 사유 수집
      const failComments = votes
        .filter(v => v.vote_type === 'fail' && v.comment && v.comment.trim() !== '')
        .map(v => `<@${v.voter_id}>: "${v.comment}"`);

      let reasonText = '*거절 사유가 기록되지 않았습니다.*';
      if (failComments.length > 0) {
        reasonText = failComments.join('\n');
      } else if (passCount === 0 && failCount === 0) {
        reasonText = '*아무도 투표에 참여하지 않아 시간 초과로 불합격 처리되었습니다.*';
      }

      updateSubmissionStatus(submissionId, 'fail', reasonText.substring(0, 500));

      embed
        .setColor(COLOR_RED)
        .setTitle(`❌ [청문회 부결] ${embed.data.title.replace('📢 [인증 청문회] ', '')}`)
        .setFields(
          { name: '🎯 미션 정보', value: `**${mission.title}** (${mission.reward_points}P)` },
          { name: '⚖️ 판결 결과', value: `💀 **불합격** (🔴 인정: \`${passCount}표\` vs 🔵 지랄ㄴㄴ: \`${failCount}표\`)` },
          { name: '🙋 제출자', value: `<@${submission.user_id}>` },
          { name: '💬 지랄ㄴㄴ 한마디 (거절 사유)', value: reasonText }
        )
        .setFooter({ text: '판결이 마감되었습니다.' });

      await message.edit({ embeds: [embed], components: [] });
      await channel.send(`💀 **인증 실패!** <@${submission.user_id}> 님의 "${mission.title}" 인증이 거절되었습니다.`);
    }

  } catch (err) {
    console.error(`❌ 청문회 마감 중 오류 (ID: ${submissionId}):`, err);
  }
}

/**
 * 봇 재부팅 시 아직 해결되지 않은 청문회 복구
 */
function resumePendingHearings(client) {
  try {
    const pending = getPendingSubmissions();
    console.log(`🔌 복구 대상 청문회: ${pending.length}건 감지됨`);

    pending.forEach(sub => {
      const expiresTime = new Date(sub.expires_at).getTime();
      const remaining = expiresTime - Date.now();

      if (remaining <= 0) {
        console.log(`⏳ [만료 복구] 즉시 판결 진행 (ID: ${sub.id})`);
        concludeHearing(client, sub.id);
      } else {
        console.log(`⏰ [타이머 재개] ${Math.round(remaining / 1000 / 60)}분 남음 (ID: ${sub.id})`);
        const timeout = setTimeout(() => {
          concludeHearing(client, sub.id);
        }, remaining);
        activeTimers.set(sub.id, timeout);
      }
    });
  } catch (err) {
    console.error('❌ 청문회 스타트업 복구 중 오류:', err);
  }
}

/**
 * 주간 나태지옥 스케줄러 시작
 */
function startWeeklySlackerScheduler(client) {
  // 30분 주기로 체크
  setInterval(() => {
    checkAndRunWeeklySlacker(client);
  }, 30 * 60 * 1000);

  // 스타트업 5초 뒤에 한번 체크
  setTimeout(() => {
    checkAndRunWeeklySlacker(client);
  }, 5000);
}

/**
 * 매주 일요일 밤 22:00 에 나태지옥 실행 여부 검사
 */
async function checkAndRunWeeklySlacker(client) {
  try {
    const statePath = path.resolve('data/slacker_state.json');
    let state = { lastRun: 0 };

    if (fs.existsSync(statePath)) {
      try {
        state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch (e) { }
    }

    const now = new Date();
    // 일요일(0), 밤 10시(22시) 대인지 검사
    if (now.getDay() === 0 && now.getHours() === 22) {
      const oneDayMs = 24 * 60 * 60 * 1000;
      // 하루 이내에 이미 실행된 이력이 없다면 구동
      if (Date.now() - state.lastRun > oneDayMs) {
        await runWeeklySlacker(client);

        state.lastRun = Date.now();
        fs.writeFileSync(statePath, JSON.stringify(state));
        console.log('👹 [주간 나태 지옥] 저격 메시지 전송 성공 및 상태 기록 완료.');
      }
    }
  } catch (err) {
    console.error('❌ 나태지옥 스케줄러 실행 중 오류:', err);
  }
}

/**
 * 나태지옥 실행 로직
 */
async function runWeeklySlacker(client) {
  const stats = getWeeklyUserStats();
  if (stats.length === 0) return;

  // 나태 유저 판별
  // 1. 최근 7일 내 제출이 1회 이상 있는 사람
  const activeUsers = stats.filter(u => u.total_sub > 0);
  let slacker = null;
  let slackerReason = '';

  if (activeUsers.length > 0) {
    // 성공률 = pass_sub / total_sub 오름차순, 시도 횟수 내림차순 정렬
    activeUsers.sort((a, b) => {
      const rateA = a.pass_sub / a.total_sub;
      const rateB = b.pass_sub / b.total_sub;
      if (rateA !== rateB) return rateA - rateB; // 성공률 낮은 쪽 우선
      return b.total_sub - a.total_sub; // 시도 횟수가 더 많은(많이 실패한) 쪽 우선
    });

    slacker = activeUsers[0];
    const ratePercent = Math.round((slacker.pass_sub / slacker.total_sub) * 100);
    slackerReason = `이번 주 미션 성공률 **${ratePercent}%** (${slacker.total_sub}회 중 ${slacker.pass_sub}회 통과)로 지옥행 열차 탑승 완료.`;
  } else {
    // 2. 제출이 아예 없는 경우 가입된 유저들 중 포인트 꼴찌인 유저 선택
    stats.sort((a, b) => a.points - b.points);
    slacker = stats[0];
    slackerReason = `최근 7일 동안 단 한 차례의 미션도 시도하지 않고 잠수를 탔으며, 현재 포인트는 **${slacker.points}P**입니다.`;
  }

  if (!slacker) return;

  // 저격 전송할 타겟 채널들을 획득
  // 최근 인증이 올라왔던 채널 리스트를 구해서 메시지 전송
  const targetChannelIds = new Set();
  try {
    const activeChannels = getRecentSubmissionChannels();
    activeChannels.forEach(c => targetChannelIds.add(c.channel_id));
  } catch (e) {
    console.error(e);
  }

  // 만약 인증 내역이 없어 타겟 채널이 비어 있다면, 봇이 들어간 모든 길드의 첫번째 사용가능한 텍스트 채널에 발송
  if (targetChannelIds.size === 0) {
    client.guilds.cache.forEach(guild => {
      const defaultChannel = guild.channels.cache.find(
        channel => channel.isTextBased() && channel.permissionsFor(guild.members.me).has('SendMessages')
      );
      if (defaultChannel) {
        targetChannelIds.add(defaultChannel.id);
      }
    });
  }

  const shameEmbed = new EmbedBuilder()
    .setTitle('👹 [나태 지옥] 이번 주 나태 지옥행 죄인 발표')
    .setColor(COLOR_RED)
    .setDescription(
      `매주 일요일 밤, 서버원들의 한 주 활동 통계를 분석하여 가장 나태한 멤버를 지옥에 박제합니다.\n\n` +
      `🔥 **이번 주의 죄인**: <@${slacker.discord_id}>\n` +
      `🔥 **판결 내용**: ${slackerReason}\n\n` +
      `멘션된 형제는 지옥 불길 속에서 뜨거운 참회의 시간을 가지고, 다음 주에는 목숨 걸고 미션을 클리어하여 지옥에서 탈출하시길 바랍니다. 💀`
    )
    .setTimestamp();

  for (const channelId of targetChannelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await channel.send({ content: `📢 <@${slacker.discord_id}> 지옥으로 끌려가라!`, embeds: [shameEmbed] });
      }
    } catch (err) {
      console.error(`❌ 나태지옥 저격 전송 실패 (채널 ID: ${channelId}):`, err);
    }
  }
}
