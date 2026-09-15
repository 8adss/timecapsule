package com.timecapsule.controller;

import com.timecapsule.common.Result;
import com.timecapsule.dto.CapsuleCreateRequest;
import com.timecapsule.entity.TimeCapsule;
import com.timecapsule.service.CapsuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 时间胶囊接口
 */
@RestController
@RequestMapping("/api/capsules")
@RequiredArgsConstructor
public class CapsuleController {

    private final CapsuleService capsuleService;

    /** 胶囊列表（未开启的排在前面，方便看倒计时） */
    @GetMapping
    public Result<List<TimeCapsule>> list(@RequestParam Long userId) {
        return Result.ok(capsuleService.listByUser(userId));
    }

    /** 已开启的胶囊（对话页选择用） */
    @GetMapping("/opened")
    public Result<List<TimeCapsule>> opened(@RequestParam Long userId) {
        return Result.ok(capsuleService.listOpened(userId));
    }

    /** 单独封存一枚胶囊（可以关联任务，也可以不关联） */
    @PostMapping
    public Result<TimeCapsule> create(@Valid @RequestBody CapsuleCreateRequest request) {
        return Result.ok(capsuleService.create(request));
    }

    /** 开启胶囊（到期后定时任务也会自动开启） */
    @PostMapping("/{id}/open")
    public Result<TimeCapsule> open(@PathVariable Long id, @RequestParam Long userId) {
        return Result.ok(capsuleService.open(id, userId));
    }
}
