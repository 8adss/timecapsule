package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.timecapsule.common.BusinessException;
import com.timecapsule.dto.CapsuleCreateRequest;
import com.timecapsule.entity.Task;
import com.timecapsule.entity.TimeCapsule;
import com.timecapsule.mapper.TaskMapper;
import com.timecapsule.mapper.TimeCapsuleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * 时间胶囊服务。
 * <p>
 * 关键点：
 * <ul>
 *   <li>所有按 id 的操作都带 userId，防止越权操作别人的胶囊</li>
 *   <li>开启用「条件更新」实现，用户手动开启和定时任务同时跑也只会成功一次</li>
 *   <li>批量自动开启用一条 UPDATE 完成，不再逐条 selectById + updateById</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CapsuleService {

    private final TimeCapsuleMapper capsuleMapper;
    private final TaskMapper taskMapper;
    private final AchievementService achievementService;

    /** 某用户的全部胶囊（按开启时间倒序，未开启的排在后面） */
    public List<TimeCapsule> listByUser(Long userId) {
        requireUserId(userId);
        return capsuleMapper.selectList(new LambdaQueryWrapper<TimeCapsule>()
                .eq(TimeCapsule::getUserId, userId)
                .orderByAsc(TimeCapsule::getStatus)
                .orderByDesc(TimeCapsule::getToDate));
    }

    /** 某用户已开启的胶囊（对话页选择用） */
    public List<TimeCapsule> listOpened(Long userId) {
        requireUserId(userId);
        return capsuleMapper.selectList(new LambdaQueryWrapper<TimeCapsule>()
                .eq(TimeCapsule::getUserId, userId)
                .eq(TimeCapsule::getStatus, TimeCapsule.STATUS_OPENED)
                .orderByDesc(TimeCapsule::getOpenedAt));
    }

    /** 按 id 取胶囊，同时校验归属 */
    public TimeCapsule getOwned(Long id, Long userId) {
        if (id == null || userId == null) {
            throw new BusinessException("胶囊ID和用户ID不能为空");
        }
        TimeCapsule capsule = capsuleMapper.selectOne(new LambdaQueryWrapper<TimeCapsule>()
                .eq(TimeCapsule::getId, id)
                .eq(TimeCapsule::getUserId, userId));
        if (capsule == null) {
            throw new BusinessException(404, "胶囊不存在或不属于当前用户");
        }
        return capsule;
    }

    /** 封存胶囊（胶囊页单独使用） */
    @Transactional(rollbackFor = Exception.class)
    public TimeCapsule create(CapsuleCreateRequest request) {
        return createInternal(request.getUserId(), request.getTaskId(),
                request.getToDate(), request.getContent(), request.getVoiceUrl());
    }

    /**
     * 封存胶囊的内部实现，供 TaskService 在同一事务里一起创建任务与胶囊。
     */
    @Transactional(rollbackFor = Exception.class)
    public TimeCapsule createInternal(Long userId, Long taskId, LocalDateTime toDate,
                                      String content, String voiceUrl) {
        requireUserId(userId);
        if (!StringUtils.hasText(content)) {
            throw new BusinessException("给未来的话不能为空");
        }
        if (toDate == null) {
            throw new BusinessException("胶囊开启时间不能为空");
        }
        if (!toDate.isAfter(LocalDateTime.now())) {
            throw new BusinessException("胶囊开启时间必须晚于当前时间");
        }
        if (taskId != null) {
            Task task = taskMapper.selectById(taskId);
            if (task == null || !Objects.equals(task.getUserId(), userId)) {
                throw new BusinessException("关联的任务不存在或不属于当前用户");
            }
        }

        TimeCapsule capsule = new TimeCapsule();
        capsule.setUserId(userId);
        capsule.setTaskId(taskId);
        capsule.setToDate(toDate);
        capsule.setContent(content.trim());
        capsule.setVoiceUrl(voiceUrl);
        capsule.setStatus(TimeCapsule.STATUS_SEALED);
        capsule.setDeleted(0);
        capsuleMapper.insert(capsule);
        return capsule;
    }

    /**
     * 开启胶囊。
     * <p>
     * 用 {@code WHERE id=? AND status=0} 的条件更新保证只开启一次：
     * 即使定时任务刚把它开启，这里的 updated 会是 0，直接回查最新状态返回。
     */
    @Transactional(rollbackFor = Exception.class)
    public TimeCapsule open(Long id, Long userId) {
        TimeCapsule capsule = getOwned(id, userId);
        if (Objects.equals(capsule.getStatus(), TimeCapsule.STATUS_OPENED)) {
            return capsule;
        }

        int updated = capsuleMapper.update(null, new LambdaUpdateWrapper<TimeCapsule>()
                .set(TimeCapsule::getStatus, TimeCapsule.STATUS_OPENED)
                .set(TimeCapsule::getOpenedAt, LocalDateTime.now())
                .eq(TimeCapsule::getId, id)
                .eq(TimeCapsule::getStatus, TimeCapsule.STATUS_SEALED));

        if (updated > 0) {
            long openedCount = countOpened(userId);
            achievementService.grantCapsuleOpened(userId, openedCount);
        }
        return getOwned(id, userId);
    }

    /**
     * 到期胶囊批量自动开启（供定时任务调用）。
     *
     * @return 本次开启的胶囊数量
     */
    @Transactional(rollbackFor = Exception.class)
    public int autoOpenExpired() {
        LocalDateTime now = LocalDateTime.now();

        // 先取出涉及的胶囊，用于给相应用户补发成就
        List<TimeCapsule> expired = capsuleMapper.selectList(new LambdaQueryWrapper<TimeCapsule>()
                .eq(TimeCapsule::getStatus, TimeCapsule.STATUS_SEALED)
                .le(TimeCapsule::getToDate, now));
        if (expired.isEmpty()) {
            return 0;
        }

        // 一条 UPDATE 全部开启（同样带 status 条件，天然幂等）
        int updated = capsuleMapper.update(null, new LambdaUpdateWrapper<TimeCapsule>()
                .set(TimeCapsule::getStatus, TimeCapsule.STATUS_OPENED)
                .set(TimeCapsule::getOpenedAt, now)
                .eq(TimeCapsule::getStatus, TimeCapsule.STATUS_SEALED)
                .le(TimeCapsule::getToDate, now));

        if (updated > 0) {
            expired.stream()
                    .map(TimeCapsule::getUserId)
                    .distinct()
                    .forEach(userId -> achievementService.grantCapsuleOpened(userId, countOpened(userId)));
            log.info("定时任务：自动开启到期胶囊 {} 个", updated);
        }
        return updated;
    }

    /** 某用户已开启的胶囊数量 */
    public long countOpened(Long userId) {
        Long count = capsuleMapper.selectCount(new LambdaQueryWrapper<TimeCapsule>()
                .eq(TimeCapsule::getUserId, userId)
                .eq(TimeCapsule::getStatus, TimeCapsule.STATUS_OPENED));
        return count == null ? 0L : count;
    }

    private void requireUserId(Long userId) {
        if (userId == null) {
            throw new BusinessException("userId 不能为空");
        }
    }
}
