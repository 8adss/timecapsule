package com.timecapsule.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * AI 模型配置表（单行，id 固定为 1）。
 * <p>
 * 字段留空表示「回落到配置文件」——所以真实 API Key 可以只放在
 * application-local.yml 里，既不进这张表也不进 SQL 脚本。
 */
@Data
@TableName("ai_config")
public class AiConfig {

    /** 该表只有一行，主键固定 */
    public static final long SINGLETON_ID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 供应商名称，仅用于展示 */
    private String provider;

    /** OpenAI 兼容端点完整地址 */
    private String baseUrl;

    /** 为空则回落到配置文件里的 key */
    private String apiKey;

    /** 模型名，如 deepseek-v4-pro */
    private String model;

    /** 采样温度 0~2 */
    private BigDecimal temperature;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
