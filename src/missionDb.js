import { getDb } from './db.js';
import crypto from 'crypto';

// 유저 정보 가져오기 (없으면 자동 생성)
export function getUser(userId) {
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(userId);
  if (!user) {
    db.prepare('INSERT INTO users (discord_id, points, achievements_list, warning_count) VALUES (?, 0, ?, 0)')
      .run(userId, JSON.stringify([]));
    user = {
      discord_id: userId,
      points: 0,
      achievements_list: '[]',
      warning_count: 0
    };
  }
  return {
    ...user,
    achievements: JSON.parse(user.achievements_list || '[]')
  };
}

// 유저 포인트 지급
export function addUserPoints(userId, amount) {
  const db = getDb();
  getUser(userId); // 유저 존재 여부 보장
  db.prepare('UPDATE users SET points = points + ? WHERE discord_id = ?').run(amount, userId);
}

// 유저 업적 잠금 해제
export function unlockUserAchievement(userId, achievementId) {
  const db = getDb();
  const user = getUser(userId);
  if (user.achievements.includes(achievementId)) {
    return false; // 이미 획득한 업적
  }
  
  user.achievements.push(achievementId);
  db.prepare('UPDATE users SET achievements_list = ? WHERE discord_id = ?')
    .run(JSON.stringify(user.achievements), userId);
  return true;
}

// 미션 생성
export function createMission({ id, creatorId, title, description, rewardPoints }) {
  const db = getDb();
  db.prepare('INSERT INTO missions (id, creator_id, title, description, reward_points, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, creatorId, title, description, rewardPoints, 'active');
  return id;
}

// 미션 조회
export function getMission(missionId) {
  const db = getDb();
  return db.prepare('SELECT * FROM missions WHERE id = ?').get(missionId);
}

// 미션 참가
export function joinMission(missionId, userId) {
  const db = getDb();
  getUser(userId); // 유저 가입 보장
  
  // 이미 참가 중인지 확인
  const existing = db.prepare('SELECT * FROM mission_participants WHERE mission_id = ? AND user_id = ?')
    .get(missionId, userId);
  if (existing) return false;

  db.prepare('INSERT INTO mission_participants (mission_id, user_id) VALUES (?, ?)')
    .run(missionId, userId);
  return true;
}

// 미션 포기
export function quitMission(missionId, userId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM mission_participants WHERE mission_id = ? AND user_id = ?')
    .run(missionId, userId);
  return result.changes > 0;
}

// 미션 참가자 목록 조회
export function getParticipants(missionId) {
  const db = getDb();
  return db.prepare('SELECT user_id FROM mission_participants WHERE mission_id = ?').all(missionId);
}

// 특정 유저의 참가 여부 확인
export function isParticipant(missionId, userId) {
  const db = getDb();
  const res = db.prepare('SELECT 1 FROM mission_participants WHERE mission_id = ? AND user_id = ?').get(missionId, userId);
  return !!res;
}

// 유저가 참가하고 있는 활성 미션 리스트
export function getJoinedActiveMissions(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT m.* FROM missions m
    JOIN mission_participants mp ON m.id = mp.mission_id
    WHERE mp.user_id = ? AND m.status = 'active'
  `).all(userId);
}

// 전체 활성 미션 리스트
export function getActiveMissions() {
  const db = getDb();
  return db.prepare("SELECT * FROM missions WHERE status = 'active'").all();
}

// 미션 상태 변경 (예: 완료 또는 수동 마감)
export function updateMissionStatus(missionId, status) {
  const db = getDb();
  db.prepare('UPDATE missions SET status = ? WHERE id = ?').run(status, missionId);
}

// 인증 제출 등록
export function createSubmission({ id, missionId, userId, proofText, proofUrl, expiresAt, guildId, channelId, messageId }) {
  const db = getDb();
  getUser(userId); // 유저 등록 보장
  db.prepare(`
    INSERT INTO submissions (id, mission_id, user_id, proof_text, proof_url, status, expires_at, guild_id, channel_id, message_id)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(id, missionId, userId, proofText, proofUrl, expiresAt, guildId, channelId, messageId);
  return id;
}

// 인증 제출 조회
export function getSubmission(submissionId) {
  const db = getDb();
  return db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId);
}

// 특정 미션에 대한 유저의 펜딩 상태 인증 가져오기
export function getPendingSubmissionForUser(missionId, userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM submissions WHERE mission_id = ? AND user_id = ? AND status = \'pending\'').get(missionId, userId);
}

// 미승인(대기 중) 인증 전체 조회 (서버 재시작 시 복구용)
export function getPendingSubmissions() {
  const db = getDb();
  return db.prepare('SELECT * FROM submissions WHERE status = \'pending\'').all();
}

// 인증 제출 상태 업데이트 및 거절 사유 추가
export function updateSubmissionStatus(submissionId, status, failReason = null) {
  const db = getDb();
  db.prepare('UPDATE submissions SET status = ?, fail_reason = ? WHERE id = ?')
    .run(status, failReason, submissionId);
}

// 투표 등록 (Upsert)
export function voteSubmission({ submissionId, voterId, voteType, comment = null }) {
  const db = getDb();
  const id = crypto.randomUUID();
  // INSERT OR REPLACE 사용으로 중복 투표 방지 및 업데이트 지원
  db.prepare(`
    INSERT INTO votes (id, submission_id, voter_id, vote_type, comment)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(submission_id, voter_id) DO UPDATE SET
      vote_type = excluded.vote_type,
      comment = excluded.comment,
      created_at = datetime('now', 'localtime')
  `).run(id, submissionId, voterId, voteType, comment);
}

// 특정 제출에 달린 투표 목록 조회
export function getVotes(submissionId) {
  const db = getDb();
  return db.prepare('SELECT * FROM votes WHERE submission_id = ?').all(submissionId);
}

// 랭킹 리더보드 조회 (누적 포인트 및 성공 횟수)
export function getLeaderboard() {
  const db = getDb();
  return db.prepare(`
    SELECT u.discord_id, u.points, u.achievements_list,
           (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.discord_id AND s.status = 'pass') as success_count
    FROM users u
    ORDER BY u.points DESC, success_count DESC
  `).all();
}

// 나태자 선정을 위한 유저 주간 활동 통계 조회
export function getWeeklyUserStats() {
  const db = getDb();
  return db.prepare(`
    SELECT u.discord_id, u.points,
           (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.discord_id AND s.created_at >= datetime('now', '-7 days')) as total_sub,
           (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.discord_id AND s.status = 'pass' AND s.created_at >= datetime('now', '-7 days')) as pass_sub
    FROM users u
  `).all();
}

// 특정 유저의 모든 통과된 제출 조회 (업적 체킹용)
export function getUserPassedSubmissions(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT s.*, m.creator_id FROM submissions s
    JOIN missions m ON s.mission_id = m.id
    WHERE s.user_id = ? AND s.status = 'pass'
    ORDER BY s.created_at ASC
  `).all(userId);
}

// 특정 유저가 생성한 미션 중 3일이 경과했고 한 번도 통과자가 없는 미션 조회 (철벽 업적용)
export function getCreatorMissionsWithoutPasses(creatorId) {
  const db = getDb();
  return db.prepare(`
    SELECT m.* FROM missions m
    WHERE m.creator_id = ? 
      AND m.created_at <= datetime('now', '-3 days')
      AND NOT EXISTS (
        SELECT 1 FROM submissions s 
        WHERE s.mission_id = m.id AND s.status = 'pass'
      )
  `).all(creatorId);
}

// 최근 제출이 있었던 채널들 조회
export function getRecentSubmissionChannels() {
  const db = getDb();
  return db.prepare('SELECT DISTINCT channel_id FROM submissions ORDER BY created_at DESC LIMIT 10').all();
}
