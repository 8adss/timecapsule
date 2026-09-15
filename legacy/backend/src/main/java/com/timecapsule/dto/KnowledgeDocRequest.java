package com.timecapsule.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 导入知识库文档的请求体
 */
@Data
public class KnowledgeDocRequest {

    @NotNull(message = "不能为空")
    private Long userId;

    @NotBlank(message = "不能为空")
    @Size(max = 200, message = "长度不能超过 200")
    private String title;

    @NotBlank(message = "不能为空")
    @Size(max = 200000, message = "正文过长，请拆分成多份导入")
    private String content;

    /** PASTE（默认）/ FILE */
    @Size(max = 20, message = "长度不能超过 20")
    private String sourceType;
}
