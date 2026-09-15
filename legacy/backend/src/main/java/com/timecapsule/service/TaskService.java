package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.timecapsule.common.BusinessException;
import com.timecapsule.dto.TaskCreateRequest;
import com.timecapsule.dto.TaskUpdateRequest;
import com.timecapsule.entity.Task;
import com.timecapsule.entity.User;
import com.timecapsule.mapper.TaskMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * 任务服务。
 * <p>
 * 关键点：
 * <ul>
 *   <li>所有按 id 的写操作都校验 userId 归属，杜绝改/删别人的任务</li>
 *   <li>创建任务时可在同一事务内一起封存胶囊，避免"任务建好了但胶囊没建"</li>
 *   <li>完成任务后触发成就发放、连续打卡与成长等级更新（业务闭环）</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    /** 创建任务时没给胶囊开启时间、也没有截止时间时，默认封存多久 */
    private static final int DEFAULT_CAPSULE_DAYS = 7;

    private final TaskMapper taskMapper;
    private final CapsuleService capsuleService;
    private final AchievementService achievementService;
    private final UserService userService;

    public List<Task> listByUser(Long userId) {
        if (userId == null) {
            throw new BusinessException("userId 不能为空");
        }
        return taskMapper.selectList(new LambdaQueryWrapper<Task>()
                .eq(Task::getUserId, userId)
                .orderByAsc(Task::getStatus)
                .orderByDesc(Task::getCreatedAt));
    }

    /** 按 id 取任务，同时校验归属 */
    public Task getOwned(Long id, Long userId) {
        if (id == null || userId == null) {
            throw new BusinessException("任务ID和用户ID不能为空");
        }
        Task task = taskMapper.selectOne(new LambdaQueryWrapper<Task>()
                .eq(Task::getId, id)
                .eq(Task::getUserId, userId));
        if (task == null) {
            throw new BusinessException(404, "任务不存在或不属于当前用户");
        }
        return task;
    }

    /**
     * 新建任务；request 里带了 capsuleContent 时，在同一个事务里一起封存胶囊。
     */
    @Transactional(rollbackFor = Exception.class)
    public Task create(TaskCreateRequest request) {
        User user = userService.getById(request.getUserId());

        Task task = new Task();
        task.setUserId(user.getId());
        task.setTitle(request.getTitle().trim());
        task.setCategory(StringUtils.hasText(request.getCategory()) ? request.getCategory().trim() : "习惯");
        task.setDescription(request.getDescription());
        task.setStartDate(request.getStartDate() != null ? request.getStartDate() : LocalDateTime.now());
        task.setDueDate(request.getDueDate());
        task.setRemindTime(request.getRemindTime());
        task.setStatus(Task.STATUS_ONGOING);
        task.setDeleted(0);
        taskMapper.insert(task);

        if (StringUtils.hasText(request.getCapsuleContent())) {
            capsuleService.createInternal(user.getId(), task.getId(),
                    resolveCapsuleToDate(request), request.getCapsuleContent(), null);
        }
        return taskMapper.selectById(task.getId());
    }

    /**
     * 更新任务。只有 DTO 里列出的字段会变，status / completedAt / userId 不受客户端控制。
     */
    @Transactional(rollbackFor = Exception.class)
    public Task update(Long id, TaskUpdateRequest request) {
        Task task = getOwned(id, request.getUserId());

        if (StringUtils.hasText(request.getTitle())) {
            task.setTitle(request.getTitle().trim());
        }
        if (StringUtils.hasText(request.getCategory())) {
            task.setCategory(request.getCategory().trim());
        }
        task.setDescription(request.getDescription());
        task.setStartDate(request.getStartDate());
        task.setDueDate(request.getDueDate());
        task.setRemindTime(request.getRemindTime());

        taskMapper.updateById(task);
        return taskMapper.selectById(id);
    }

    /** 删除任务（逻辑删除，数据仍留在库里，deleted 置 1） */
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id, Long userId) {
        getOwned(id, userId);
        taskMapper.deleteById(id);
    }

    /**
     * 完成任务：状态置 1、记录完成时间，并触发成就 / 连续打卡 / 成长等级更新。
     * 重复调用是幂等的，不会重复发放成就。
     */
    @Transactional(rollbackFor = Exception.class)
    public Task complete(Long id, Long userId) {
        Task task = getOwned(id, userId);
        if (Objects.equals(task.getStatus(), Task.STATUS_DONE)) {
            return task;
        }

        task.setStatus(Task.STATUS_DONE);
        task.setCompletedAt(LocalDateTime.now());
        taskMapper.updateById(task);

        // ===== 业务闭环：成就 + 连续打卡 + 成长等级 =====
        long doneCount = userService.countDoneTasks(userId);
        achievementService.grantTaskDone(userId, doneCount);
        User user = userService.refreshStats(userId);
        if (user != null && user.getStreakDays() != null) {
            achievementService.grantStreak(userId, user.getStreakDays());
        }
        return taskMapper.selectById(id);
    }

    /** 放弃任务（状态置 3），已完成的任务不允许再放弃 */
    @Transactional(rollbackFor = Exception.class)
    public Task abandon(Long id, Long userId) {
        Task task = getOwned(id, userId);
        if (Objects.equals(task.getStatus(), Task.STATUS_DONE)) {
            throw new BusinessException("已完成的任务不能标记为放弃");
        }
        task.setStatus(Task.STATUS_ABANDONED);
        taskMapper.updateById(task);
        return taskMapper.selectById(id);
    }

    /**
     * 把已过截止时间且仍在进行中的任务标记为已逾期（供定时任务调用）。
     *
     * @return 处理条数
     */
    @Transactional(rollbackFor = Exception.class)
    public int markOverdue() {
        Task patch = new Task();
        patch.setStatus(Task.STATUS_OVERDUE);
        return taskMapper.update(patch, new LambdaUpdateWrapper<Task>()
                .eq(Task::getStatus, Task.STATUS_ONGOING)
                .isNotNull(Task::getDueDate)
                .lt(Task::getDueDate, LocalDateTime.now()));
    }

    /**
     * 解析胶囊开启时间：
     * 优先用显式指定的，其次用任务截止时间，都没有则默认 7 天后。
     * <p>
     * 注意这里绝不能用"当前时间"兜底——初版就是那么写的，导致不填截止时间时
     * 胶囊一创建就到期，下一分钟被定时任务自动开启。
     */
    private LocalDateTime resolveCapsuleToDate(TaskCreateRequest request) {
        if (request.getCapsuleToDate() != null) {
            return request.getCapsuleToDate();
        }
        if (request.getDueDate() != null) {
            return request.getDueDate();
        }
        return LocalDateTime.now().plusDays(DEFAULT_CAPSULE_DAYS);
    }
}
