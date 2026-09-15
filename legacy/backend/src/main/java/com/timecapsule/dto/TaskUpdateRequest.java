package com.timecapsule.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 更新任务请求体。
 * <p>
 * 不包含 {@code status}、{@code completedAt}、{@code userId}：
 * 状态流转走 complete / abandon 专用接口，归属由 userId 校验。
 */
@Data
public class TaskUpdateRequest {

    @NotNull(message = "不能为空")
    private Long userId;

    @Size(max = 100, message = "长度不能超过 100")
    private String title;

    @Size(max = 20, message = "长度不能超过 20")
    private String category;

    @Size(max = 500, message = "长度不能超过 500")
    private String description;

    private LocalDateTime startDate;

    private LocalDateTime dueDate;

    private LocalDateTime remindTime;
}
