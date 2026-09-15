package com.timecapsule.controller;

import com.timecapsule.common.Result;
import com.timecapsule.entity.Achievement;
import com.timecapsule.service.AchievementService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 成就接口。
 * <p>
 * 只有查询接口：成就由完成任务 / 开启胶囊自动发放，
 * 原先那个"手动发放成就（测试用）"的 POST 接口已移除——它对任何调用者开放，
 * 上线前就是一个可以给自己刷成就的洞。
 */
@RestController
@RequestMapping("/api/achievements")
@RequiredArgsConstructor
public class AchievementController {

    private final AchievementService achievementService;

    @GetMapping
    public Result<List<Achievement>> list(@RequestParam Long userId) {
        return Result.ok(achievementService.listByUser(userId));
    }
}
