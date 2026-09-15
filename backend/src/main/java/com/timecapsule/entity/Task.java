package com.timecapsule.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 任务表
 */
@Data
@TableName("tasks")
public class Task {

    /** 状态：进行中 */
    public static final int STATUS_ONGOING = 0;
    /** 状态：已完成 */
    public static final int STATUS_DONE = 1;
    /** 状态：已逾期（由定时任务自动标记） */
    public static final int STATUS_OVERDUE = 2;
    /** 状态：已放弃 */
    public static final int STATUS_ABANDONED = 3;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 任务名称 */
    private String title;

    /** 类别：学习 / 健身 / 工作 / 习惯 */
    private String category;

    /** 任务描述 */
    private String description;

    private LocalDateTime startDate;

    /** 截止时间 */
    private LocalDateTime dueDate;

    /** 提醒时间 */
    private LocalDateTime remindTime;

    /** 0进行中 1已完成 2已逾期 3已放弃，取值见本类常量 */
    private Integer status;

    private LocalDateTime completedAt;

    /** 逻辑删除：0正常 1已删除（MyBatis-Plus 自动在查询里追加 deleted=0） */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
