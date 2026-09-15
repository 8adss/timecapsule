package com.timecapsule.task;

import com.timecapsule.service.CapsuleService;
import com.timecapsule.service.TaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 定时任务：
 * <ul>
 *   <li>每分钟扫描到期的时间胶囊，自动开启</li>
 *   <li>每分钟把过了截止时间仍未完成的任务标记为「已逾期」</li>
 * </ul>
 * <p>
 * 两个任务各自 try/catch：一个出错不会影响另一个，也不会让调度线程静默停掉。
 * <p>
 * 注意：多实例部署时这两个任务会在每个实例上各跑一遍。开启胶囊用的是条件更新，
 * 重复执行是安全的（只有第一个实例的 UPDATE 会影响行）；标记逾期同理。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CapsuleScheduledTask {

    private final CapsuleService capsuleService;
    private final TaskService taskService;

    /** 到点自动开启胶囊 */
    @Scheduled(cron = "0 * * * * *")
    public void autoOpenExpiredCapsules() {
        try {
            capsuleService.autoOpenExpired();
        } catch (Exception e) {
            log.error("自动开启到期胶囊失败", e);
        }
    }

    /** 把逾期未完成的任务标记为已逾期 */
    @Scheduled(cron = "30 * * * * *")
    public void markOverdueTasks() {
        try {
            int updated = taskService.markOverdue();
            if (updated > 0) {
                log.info("定时任务：标记已逾期任务 {} 个", updated);
            }
        } catch (Exception e) {
            log.error("标记逾期任务失败", e);
        }
    }
}
