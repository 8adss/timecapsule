package com.timecapsule.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 新建任务请求体。
 * <p>
 * 只暴露允许客户端设置的字段，不再直接绑定 Task 实体，
 * 避免客户端通过 {@code userId / status / completedAt} 越权写入。
 * <p>
 * 可选的胶囊字段：填了 {@code capsuleContent} 就在同一个事务里一起封存胶囊，
 * 这样前端不必再发第二次请求（初版分两步调用，第二步失败会出现"有任务没胶囊"）。
 */
@Data
public class TaskCreateRequest {

    @NotNull(message = "不能为空")
    private Long userId;

    @NotBlank(message = "不能为空")
    @Size(max = 100, message = "长度不能超过 100")
    private String title;

    @Size(max = 20, message = "长度不能超过 20")
    private String category;

    @Size(max = 500, message = "长度不能超过 500")
    private String description;

    private LocalDateTime startDate;

    private LocalDateTime dueDate;

    private LocalDateTime remindTime;

    /** 写给未来的话，为空表示不创建胶囊 */
    @Size(max = 5000, message = "长度不能超过 5000")
    private String capsuleContent;

    /** 胶囊开启时间；给了 capsuleContent 但没给这个值时，默认取截止时间，再没有则取 7 天后 */
    private LocalDateTime capsuleToDate;
}
