package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.timecapsule.entity.Achievement;
import com.timecapsule.mapper.AchievementMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 成就服务（自我决定理论里的"胜任感"来源）。
 * <p>
 * 发放按里程碑进行：完成 1 / 3 / 5 / 10 / 20 个任务各解锁一枚，
 * 而不是每完成一个就插一条，避免成就列表被刷屏。
 * <p>
 * 幂等由数据库唯一索引 {@code uk_user_type_value} 保证，
 * 不再依赖"先 selectCount 再 insert"——那种写法在并发下会重复发放。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AchievementService {

    /** 任务完成的里程碑 */
    private static final int[] TASK_DONE_MILESTONES = {1, 3, 5, 10, 20, 50};
    /** 胶囊开启的里程碑 */
    private static final int[] CAPSULE_OPENED_MILESTONES = {1, 2, 3, 5, 10};
    /** 连续打卡的里程碑 */
    private static final int[] STREAK_MILESTONES = {2, 3, 7, 14, 30, 100};

    private final AchievementMapper achievementMapper;

    public List<Achievement> listByUser(Long userId) {
        return achievementMapper.selectList(new LambdaQueryWrapper<Achievement>()
                .eq(Achievement::getUserId, userId)
                .orderByAsc(Achievement::getType)
                .orderByAsc(Achievement::getValue));
    }

    /** 任务完成数变化后调用 */
    public void grantTaskDone(Long userId, long doneCount) {
        grantMilestones(userId, Achievement.TYPE_TASK_DONE, doneCount, TASK_DONE_MILESTONES);
    }

    /** 胶囊开启数变化后调用 */
    public void grantCapsuleOpened(Long userId, long openedCount) {
        grantMilestones(userId, Achievement.TYPE_CAPSULE_OPENED, openedCount, CAPSULE_OPENED_MILESTONES);
    }

    /** 连续打卡天数变化后调用 */
    public void grantStreak(Long userId, int streakDays) {
        grantMilestones(userId, Achievement.TYPE_STREAK, streakDays, STREAK_MILESTONES);
    }

    /**
     * 发放所有已达成的里程碑中尚未发放的那些。
     *
     * @return 本次新解锁的成就（可能为空列表）
     */
    public List<Achievement> grantMilestones(Long userId, String type, long current, int[] milestones) {
        List<Achievement> newlyUnlocked = new ArrayList<>();
        for (int milestone : milestones) {
            if (current < milestone) {
                break;
            }
            Achievement granted = grant(userId, type, milestone);
            if (granted != null) {
                newlyUnlocked.add(granted);
            }
        }
        return newlyUnlocked;
    }

    /**
     * 发放单个成就，已存在则返回 null。
     * 幂等靠唯一索引 + 捕获 DuplicateKeyException，并发安全。
     */
    public Achievement grant(Long userId, String type, int value) {
        Achievement achievement = new Achievement();
        achievement.setUserId(userId);
        achievement.setType(type);
        achievement.setValue(value);
        try {
            achievementMapper.insert(achievement);
            log.info("用户 {} 解锁成就：{} × {}", userId, type, value);
            return achievement;
        } catch (DuplicateKeyException e) {
            // 已经发过了，属于正常情况
            return null;
        }
    }
}
