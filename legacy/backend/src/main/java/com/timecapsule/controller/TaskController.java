package com.timecapsule.controller;

import com.timecapsule.common.Result;
import com.timecapsule.dto.TaskCreateRequest;
import com.timecapsule.dto.TaskUpdateRequest;
import com.timecapsule.entity.Task;
import com.timecapsule.service.TaskService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 任务接口。
 * <p>
 * 注意：所有按 id 的写操作（改 / 删 / 完成 / 放弃）都必须带 {@code userId}，
 * Service 里会校验这条记录确实属于该用户；请求体也换成专用 DTO，
 * 客户端无法再通过 userId / status / completedAt 字段越权写入。
 */
@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;

    /** 任务列表 */
    @GetMapping
    public Result<List<Task>> list(@RequestParam Long userId) {
        return Result.ok(taskService.listByUser(userId));
    }

    /** 新建任务；带 capsuleContent 时会同时封存一枚时间胶囊 */
    @PostMapping
    public Result<Task> create(@Valid @RequestBody TaskCreateRequest request) {
        return Result.ok(taskService.create(request));
    }

    /** 编辑任务 */
    @PutMapping("/{id}")
    public Result<Task> update(@PathVariable Long id, @Valid @RequestBody TaskUpdateRequest request) {
        return Result.ok(taskService.update(id, request));
    }

    /** 删除任务（逻辑删除） */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id, @RequestParam Long userId) {
        taskService.delete(id, userId);
        return Result.ok();
    }

    /** 完成任务：会同时更新连续打卡、成长等级并发放成就 */
    @PostMapping("/{id}/complete")
    public Result<Task> complete(@PathVariable Long id, @RequestParam Long userId) {
        return Result.ok(taskService.complete(id, userId));
    }

    /** 放弃任务 */
    @PostMapping("/{id}/abandon")
    public Result<Task> abandon(@PathVariable Long id, @RequestParam Long userId) {
        return Result.ok(taskService.abandon(id, userId));
    }
}
