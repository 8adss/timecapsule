package com.timecapsule.dto;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 封存时间胶囊请求体
 */
@Data
public class CapsuleCreateRequest {

    @NotNull(message = "不能为空")
    private Long userId;

    /** 关联任务，可为空（独立胶囊） */
    private Long taskId;

    @NotNull(message = "不能为空")
    @Future(message = "必须是未来的时间")
    private LocalDateTime toDate;

    @NotBlank(message = "不能为空")
    @Size(max = 5000, message = "长度不能超过 5000")
    private String content;

    @Size(max = 255, message = "长度不能超过 255")
    private String voiceUrl;
}
