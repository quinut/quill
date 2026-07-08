import { 
  getUserPassedSubmissions, 
  getCreatorMissionsWithoutPasses, 
  unlockUserAchievement, 
  addUserPoints 
} from './missionDb.js';

export const ACHIEVEMENTS = {
  first_step: {
    id: 'first_step',
    name: '첫걸음',
    description: '최초로 미션 1회 성공',
    bonusPoints: 50
  },
  relentless: {
    id: 'relentless',
    name: '독종',
    description: '7일 연속 미션 성공',
    bonusPoints: 200
  },
  social_butterfly: {
    id: 'social_butterfly',
    name: '마당발',
    description: '서로 다른 친구 5명이 만든 미션 각각 클리어',
    bonusPoints: 150
  },
  iron_wall: {
    id: 'iron_wall',
    name: '철벽',
    description: '내가 올린 미션에 아무도 성공하지 못함 (등록 후 3일 경과)',
    bonusPoints: 100
  }
};

/**
 * 특정 유저의 업적 달성 상태를 점검하고, 새로 달성한 업적이 있으면 포인트를 지급하고 목록을 반환합니다.
 * @param {string} userId - 디스코드 유저 ID
 * @returns {Array} - 새로 해금된 업적 객체 목록
 */
export function checkAndUnlockAchievements(userId) {
  const newlyUnlocked = [];
  const passed = getUserPassedSubmissions(userId);

  // 1. 첫걸음: 최초 미션 1회 성공
  if (passed.length >= 1) {
    const success = unlockUserAchievement(userId, ACHIEVEMENTS.first_step.id);
    if (success) {
      addUserPoints(userId, ACHIEVEMENTS.first_step.bonusPoints);
      newlyUnlocked.push(ACHIEVEMENTS.first_step);
    }
  }

  // 2. 독종: 7일 연속 미션 성공
  if (passed.length >= 7) {
    // 날짜별로 성공 일자만 추출 (YYYY-MM-DD)
    const datesSet = new Set();
    passed.forEach(sub => {
      if (sub.created_at) {
        // 'YYYY-MM-DD' 형식 추출
        const datePart = sub.created_at.split(' ')[0];
        datesSet.add(datePart);
      }
    });

    const sortedDates = Array.from(datesSet).sort();
    let consecutiveCount = 1;
    let maxConsecutive = 1;

    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffTime = Math.abs(curr - prev);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        consecutiveCount++;
        if (consecutiveCount > maxConsecutive) {
          maxConsecutive = consecutiveCount;
        }
      } else if (diffDays > 1) {
        consecutiveCount = 1;
      }
    }

    if (maxConsecutive >= 7) {
      const success = unlockUserAchievement(userId, ACHIEVEMENTS.relentless.id);
      if (success) {
        addUserPoints(userId, ACHIEVEMENTS.relentless.bonusPoints);
        newlyUnlocked.push(ACHIEVEMENTS.relentless);
      }
    }
  }

  // 3. 마당발: 서로 다른 친구 5명이 만든 미션 각각 클리어
  const otherCreators = new Set();
  passed.forEach(sub => {
    if (sub.creator_id && sub.creator_id !== userId) {
      otherCreators.add(sub.creator_id);
    }
  });

  if (otherCreators.size >= 5) {
    const success = unlockUserAchievement(userId, ACHIEVEMENTS.social_butterfly.id);
    if (success) {
      addUserPoints(userId, ACHIEVEMENTS.social_butterfly.bonusPoints);
      newlyUnlocked.push(ACHIEVEMENTS.social_butterfly);
    }
  }

  // 4. 철벽: 내가 만든 미션 중 3일 경과 후 한 명도 성공하지 못한 미션 확인
  const ironWallMissions = getCreatorMissionsWithoutPasses(userId);
  if (ironWallMissions.length >= 1) {
    const success = unlockUserAchievement(userId, ACHIEVEMENTS.iron_wall.id);
    if (success) {
      addUserPoints(userId, ACHIEVEMENTS.iron_wall.bonusPoints);
      newlyUnlocked.push(ACHIEVEMENTS.iron_wall);
    }
  }

  return newlyUnlocked;
}

/**
 * 모든 유저의 철벽 업적만 특별 점검할 때 사용 (백그라운드 스케줄러 등에서 활용)
 * @param {string} userId
 * @returns {Object|null} - 새로 해금되었다면 업적 객체, 아니면 null
 */
export function checkIronWallOnly(userId) {
  const ironWallMissions = getCreatorMissionsWithoutPasses(userId);
  if (ironWallMissions.length >= 1) {
    const success = unlockUserAchievement(userId, ACHIEVEMENTS.iron_wall.id);
    if (success) {
      addUserPoints(userId, ACHIEVEMENTS.iron_wall.bonusPoints);
      return ACHIEVEMENTS.iron_wall;
    }
  }
  return null;
}
