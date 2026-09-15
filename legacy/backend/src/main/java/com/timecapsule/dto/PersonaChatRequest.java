package com.timecapsule.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 与「何时的自己」对话的请求体
 */
@Data
public class PersonaChatRequest {

    @NotNull(message = "不能为空")
    private Long userId;

    /** 分身ID（必须属于该用户且状态为 READY） */
    @NotNull(message = "不能为空")
    private Long personaId;

    @NotBlank(message = "不能为空")
    @Size(max = 2000, message = "长度不能超过 2000")
    private String message;
}
