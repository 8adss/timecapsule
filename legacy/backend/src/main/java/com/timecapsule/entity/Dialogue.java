package com.timecapsule.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 对话记录表：两类对话共用一张表
 * <ul>
 *   <li>与「过去的你」对话：capsule_id 有值，role = ai_past_self</li>
 *   <li>与「何时的自己」对话：persona_id 有值，role = ai_persona</li>
 * </ul>
 */
@Data
@TableName("dialogues")
public class Dialogue {

    /** 角色：用户 */
    public static final String ROLE_USER = "user";
    /** 角色：AI 扮演的"过去的你"（基于时间胶囊） */
    public static final String ROLE_AI = "ai_past_self";
    /** 角色：AI 扮演的"何时的自己"（基于知识库分身） */
    public static final String ROLE_PERSONA = "ai_persona";

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 关联胶囊（与「过去的你」对话时使用） */
    private Long capsuleId;

    /** 关联分身（与「何时的自己」对话时使用） */
    private Long personaId;

    /** user / ai_past_self / ai_persona，取值见本类常量 */
    private String role;

    private String content;

    /** 情绪标签：挫败/犹豫/孤独/喜悦/平静 */
    private String emotionTag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
