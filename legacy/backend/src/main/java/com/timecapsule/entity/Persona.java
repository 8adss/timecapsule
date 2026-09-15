package com.timecapsule.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 自我分身：把知识库蒸馏成「某个时间点的自己」，可以与它对话。
 * <p>
 * 这是 v2 的核心概念——胶囊代表「写下那句话时的我」，
 * 分身则代表「何时的我」，两者并列出现在对话页让用户选择。
 */
@Data
@TableName("personas")
public class Persona {

    /** 草稿：还没生成画像 */
    public static final String STATUS_DRAFT = "DRAFT";
    /** 生成中：后台正在调大模型蒸馏 */
    public static final String STATUS_GENERATING = "GENERATING";
    /** 就绪：可以对话 */
    public static final String STATUS_READY = "READY";
    /** 生成失败：fail_reason 里有原因 */
    public static final String STATUS_FAILED = "FAILED";

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 分身名称，如「2026 年 9 月的我」 */
    private String name;

    /** 代表哪个时间点的自己 */
    private LocalDate selfDate;

    /** 画像：性格 / 在意的事 / 正在经历的阶段 */
    private String summary;

    /** 说话风格：语气、常用表达、口头禅 */
    private String stylePrompt;

    /** DRAFT / GENERATING / READY / FAILED */
    private String status;

    /** 生成失败原因 */
    private String failReason;

    /** 参与生成的知识库文档数 */
    private Integer docCount;

    /** 生成时使用的模型 */
    private String model;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
