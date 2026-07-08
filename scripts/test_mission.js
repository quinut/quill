import { initDb } from '../src/db.js';
import { 
  getUser, 
  createMission, 
  getMission, 
  joinMission, 
  quitMission, 
  getParticipants, 
  isParticipant, 
  createSubmission, 
  voteSubmission, 
  getVotes, 
  getLeaderboard, 
  getWeeklyUserStats,
  getUserPassedSubmissions,
  getCreatorMissionsWithoutPasses,
  updateSubmissionStatus,
  addUserPoints
} from '../src/missionDb.js';
import { checkAndUnlockAchievements } from '../src/achievement.js';
import Database from 'better-sqlite3';

console.log('🧪 Starting Mission Hunter SQLite DB and Logic tests...');

// 1. DB 초기화
try {
  initDb();
  console.log('✅ DB initialized.');
} catch (e) {
  console.error('❌ Failed to initialize DB:', e);
  process.exit(1);
}

// 2. 유저 테스트
const testUser1 = 'user_test_1';
const testUser2 = 'user_test_2';
const testUser3 = 'user_test_3';

console.log('\n--- 1. User & Points Tests ---');
const u1 = getUser(testUser1);
console.log(`Initial User 1: Points = ${u1.points}, Achievements = ${JSON.stringify(u1.achievements)}`);

addUserPoints(testUser1, 100);
const u1Updated = getUser(testUser1);
console.log(`Updated User 1: Points = ${u1Updated.points} (Expected: 100)`);

// 3. 미션 테스트
console.log('\n--- 2. Mission creation & Join/Quit Tests ---');
const missionId = 'mission_test_id_123';
try {
  createMission({
    id: missionId,
    creatorId: testUser2,
    title: '아침 7시 기상 인증',
    description: '매일 아침 7시 기상 사진 인증',
    rewardPoints: 50
  });
  console.log(`Created mission with ID: ${missionId}`);
} catch (e) {
  console.log(`Mission might already exist, which is fine:`, e.message);
}

const mission = getMission(missionId);
console.log(`Mission loaded: "${mission.title}" by Creator: ${mission.creator_id}, Reward: ${mission.reward_points}P`);

joinMission(missionId, testUser1);
joinMission(missionId, testUser3);
console.log(`Participants after joining: ${JSON.stringify(getParticipants(missionId))}`);

quitMission(missionId, testUser3);
console.log(`Participants after user 3 quitted: ${JSON.stringify(getParticipants(missionId))}`);
console.log(`Is user 1 participating: ${isParticipant(missionId, testUser1)} (Expected: true)`);
console.log(`Is user 3 participating: ${isParticipant(missionId, testUser3)} (Expected: false)`);

// 4. 인증 및 투표 테스트
console.log('\n--- 3. Submission & Voting Tests ---');
const submissionId = 'sub_test_id_999';
try {
  createSubmission({
    id: submissionId,
    missionId: missionId,
    userId: testUser1,
    proofText: '7시 정각 기상했습니다!',
    proofUrl: 'https://cdn.discordapp.com/attachments/test.png',
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    guildId: 'guild_test',
    channelId: 'channel_test',
    messageId: 'message_test'
  });
  console.log('Submission created.');
} catch (e) {
  console.log('Submission might already exist:', e.message);
}

voteSubmission({ submissionId, voterId: testUser2, voteType: 'pass' });
voteSubmission({ submissionId, voterId: testUser3, voteType: 'fail', comment: '눈곱 덜 뗌' });

const votes = getVotes(submissionId);
console.log(`Votes collected: ${JSON.stringify(votes)}`);

// 5. 업적 판정 알고리즘 테스트
console.log('\n--- 4. Achievements check Tests ---');
// '첫걸음' 테스트: 최초 1회 성공 시 해금 검증
updateSubmissionStatus(submissionId, 'pass'); // 승인 처리
const unlocked = checkAndUnlockAchievements(testUser1);
console.log(`Unlocked achievements for user 1 (first success): ${JSON.stringify(unlocked)}`);
const u1Final = getUser(testUser1);
console.log(`User 1 final points after first step achievement: ${u1Final.points} (Expected: 100 + 50[achievement] = 150)`);

// 독종 업적 테스트 (7일 연속 미션 성공)
console.log('\n--- 5. Consecutive 7 days (독종) check Tests ---');
// 임의의 7일간의 성공 데이터 주입 (과거 7일 날짜 생성)
const db = new Database('data/database.db');
// 기존 테스트 데이터 클리어
db.prepare('DELETE FROM submissions WHERE user_id = ?').run(testUser1);

const baseDate = new Date();
for (let i = 0; i < 7; i++) {
  const date = new Date(baseDate);
  date.setDate(baseDate.getDate() - i);
  // date YYYY-MM-DD HH:mm:ss format
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd} 12:00:00`;
  
  const subId = `streak_sub_${i}`;
  db.prepare(`
    INSERT INTO submissions (id, mission_id, user_id, proof_text, status, expires_at, guild_id, channel_id, message_id, created_at)
    VALUES (?, ?, ?, ?, 'pass', ?, 'g', 'c', 'm', ?)
  `).run(subId, missionId, testUser1, `Day ${i} proof`, '2026-07-08', dateStr);
}

const streakUnlocked = checkAndUnlockAchievements(testUser1);
console.log(`Consecutive 7 days test: Newly unlocked achievements = ${JSON.stringify(streakUnlocked)}`);
const u1Streak = getUser(testUser1);
console.log(`User 1 achievements list: ${JSON.stringify(u1Streak.achievements)} (Expected to include 'relentless')`);

// 6. 나태 지옥 통계 테스트
console.log('\n--- 6. Weekly Slacker Stats Tests ---');
const stats = getWeeklyUserStats();
console.log(`Weekly user stats: ${JSON.stringify(stats)}`);

console.log('🧪 Tests complete!');
