package com.timecapsule.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 保存 AI 模型配置的请求体。
 * <p>
 * {@code apiKey} 留空表示"不改动已有 key"——前端回显的是掩码，
 * 用户不重新填写时不应该把掩码当成新 key 存进去。
 */
@Data
public class AiConfigRequest {

    @Size(max = 50, message = "长度不能超过 50")
    private String provider;

    @NotBlank(message = "不能为空")
    @Size(max = 255, message = "长度不能超过 255")
    private String baseUrl;

    @Size(max = 255, message = "长度不能超过 255")
    private String apiKey;

    @NotBlank(message = "不能为空")
    @Size(max = 100, message = "长度不能超过 100")
    private String model;

    @DecimalMin(value = "0.0", message = "不能小于 0")
    @DecimalMax(value = "2.0", message = "不能大于 2")
    private Double temperature;
}
