package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.timecapsule.common.BusinessException;
import com.timecapsule.entity.Task;
import com.timecapsule.entity.User;
import com.timecapsule.mapper.TaskMapper;
import com.timecapsule.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 用户服务：openid 查找或创建（本地测试可传任意 openid）。
 * <p>
 * 另外负责根据任务完成记录回算「连续打卡天数」与「成长等级」，
 * 让这两个字段真正跟着用户行为变化，而不是永远停在初始值。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    /** 每完成多少个任务升一级 */
    private static final int TASKS_PER_LEVEL = 5;

    private final UserMapper userMapper;
    private final TaskMapper taskMapper;
    private final FileStorageService fileStorageService;

    /**
     * 按 openid 查找用户，不存在则创建。
     * <p>
     * 并发下同一个 openid 可能被同时创建：users 表有 uk_openid 唯一索引兜底，
     * 这里捕获唯一键冲突后回查，避免直接抛 500。
     */
    public User findOrCreateByOpenid(String openid) {
        if (!StringUtils.hasText(openid)) {
            throw new BusinessException("openid 不能为空");
        }
        String normalized = openid.trim();
        User user = selectByOpenid(normalized);
        if (user != null) {
            return user;
        }

        User created = new User();
        created.setOpenid(normalized);
        created.setNickname("新朋友");
        created.setStreakDays(0);
        created.setGrowthLevel(1);
        try {
            userMapper.insert(created);
            return created;
        } catch (DuplicateKeyException e) {
            log.info("openid {} 已被并发创建，回查已有记录", normalized);
            User existing = selectByOpenid(normalized);
            if (existing == null) {
                throw new BusinessException("创建用户失败，请重试");
            }
            return existing;
        }
    }

    public User getById(Long id) {
        if (id == null) {
            throw new BusinessException("用户ID不能为空");
        }
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new BusinessException(404, "用户不存在：" + id);
        }
        return user;
    }

    /** 修改昵称 / 头像 */
    public User updateProfile(Long userId, String nickname, String avatarUrl) {
        User user = getById(userId);
        if (StringUtils.hasText(nickname)) {
            user.setNickname(nickname.trim());
        }
        if (StringUtils.hasText(avatarUrl)) {
            user.setAvatarUrl(avatarUrl.trim());
        }
        userMapper.updateById(user);
        return userMapper.selectById(userId);
    }

    /**
     * 更新头像：存文件 → 写库 → 删掉上一张。
     * <p>
     * 删除只针对「本服务自己存的」图片：种子数据里用户头像可能是外链（dicebear），
     * 那种情况下不能去删别人的资源。删除失败也不影响本次更新结果。
     */
    @Transactional(rollbackFor = Exception.class)
    public User updateAvatar(Long userId, MultipartFile file) {
        User user = getById(userId);
        String previous = user.getAvatarUrl();

        String url = fileStorageService.storeAvatar(userId, file);
        user.setAvatarUrl(url);
        userMapper.updateById(user);

        fileStorageService.deleteIfLocal(previous);
        return userMapper.selectById(userId);
    }

    /**
     * 重新计算并写回连续打卡天数与成长等级。
     *
     * @return 更新后的用户
     */
    public User refreshStats(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            return null;
        }
        long doneCount = countDoneTasks(userId);
        user.setStreakDays(calcStreak(userId));
        user.setGrowthLevel((int) (doneCount / TASKS_PER_LEVEL) + 1);
        userMapper.updateById(user);
        return userMapper.selectById(userId);
    }

    /** 该用户已完成的任务数 */
    public long countDoneTasks(Long userId) {
        Long count = taskMapper.selectCount(new LambdaQueryWrapper<Task>()
                .eq(Task::getUserId, userId)
                .eq(Task::getStatus, Task.STATUS_DONE));
        return count == null ? 0L : count;
    }

    /**
     * 连续打卡天数：从今天（或昨天）往前数，连续有任务完成的天数。
     * <p>
     * 今天还没完成任务时不清零，从昨天开始数——否则每天早上打开页面都会看到打卡断了。
     */
    private int calcStreak(Long userId) {
        List<Task> doneTasks = taskMapper.selectList(new LambdaQueryWrapper<Task>()
                .select(Task::getCompletedAt)
                .eq(Task::getUserId, userId)
                .eq(Task::getStatus, Task.STATUS_DONE)
                .isNotNull(Task::getCompletedAt));
        Set<LocalDate> days = doneTasks.stream()
                .map(task -> task.getCompletedAt().toLocalDate())
                .collect(Collectors.toSet());
        if (days.isEmpty()) {
            return 0;
        }

        LocalDate cursor = LocalDate.now();
        if (!days.contains(cursor)) {
            cursor = cursor.minusDays(1);
            if (!days.contains(cursor)) {
                return 0;
            }
        }
        int streak = 0;
        while (days.contains(cursor)) {
            streak++;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }

    private User selectByOpenid(String openid) {
        return userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getOpenid, openid));
    }
}
