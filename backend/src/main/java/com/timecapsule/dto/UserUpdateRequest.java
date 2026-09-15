package com.timecapsule.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 修改个人资料请求体（"我的"页面用）
 */
@Data
public class UserUpdateRequest {

    @NotNull(message = "不能为空")
    private Long userId;

    @Size(max = 50, message = "长度不能超过 50")
    private String nickname;

    @Size(max = 255, message = "长度不能超过 255")
    private String avatarUrl;
}
