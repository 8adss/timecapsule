package com.timecapsule.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 创建「自己的分身」的请求体
 */
@Data
public class PersonaCreateRequest {

    @NotNull(message = "不能为空")
    private Long userId;

    @NotBlank(message = "不能为空")
    @Size(max = 100, message = "长度不能超过 100")
    private String name;

    /** 这个分身代表哪个时间点的自己 */
    @NotNull(message = "不能为空")
    private LocalDate selfDate;

    /** 参与蒸馏的知识库文档，至少要选一篇 */
    @NotEmpty(message = "至少要选择一篇知识库文档")
    private List<Long> docIds;
}
