package com.timecapsule.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 与"过去的你"对话的请求体
 */
@Data
public class ChatRequest {

    /** 用户ID */
    @NotNull(message = "不能为空")
    private Long userId;

    /** 关联胶囊ID（必须是已开启的胶囊） */
    @NotNull(message = "不能为空")
    private Long capsuleId;

    /** 用户当前说的话 */
    @NotBlank(message = "不能为空")
    @Size(max = 2000, message = "长度不能超过 2000")
    private String message;
}
