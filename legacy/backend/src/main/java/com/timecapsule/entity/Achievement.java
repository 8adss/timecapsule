package com.timecapsule.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 成就表
 */
@Data
@TableName("achievements")
public class Achievement {

    /** 成就类型：任务完成（value = 累计完成数） */
    public static final String TYPE_TASK_DONE = "任务完成";
    /** 成就类型：胶囊开启（value = 累计开启数） */
    public static final String TYPE_CAPSULE_OPENED = "胶囊开启";
    /** 成就类型：连续打卡（value = 连续天数） */
    public static final String TYPE_STREAK = "连续打卡";

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 类型：任务完成 / 胶囊开启 / 连续打卡，取值见本类常量 */
    private String type;

    /** 达成数值 */
    private Integer value;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime unlockedAt;
}
