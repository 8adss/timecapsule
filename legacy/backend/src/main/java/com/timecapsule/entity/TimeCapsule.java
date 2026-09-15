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
 * 时间胶囊表：创建任务时写给未来自己的话
 */
@Data
@TableName("time_capsules")
public class TimeCapsule {

    /** 状态：未开启（封存中） */
    public static final int STATUS_SEALED = 0;
    /** 状态：已开启 */
    public static final int STATUS_OPENED = 1;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 关联任务，可为空（支持独立胶囊） */
    private Long taskId;

    /** 未来开启时间 */
    private LocalDateTime toDate;

    /** 写给未来的话 */
    private String content;

    /** 语音留言（可选，暂未实现） */
    private String voiceUrl;

    /** 0未开启 1已开启，取值见本类常量 */
    private Integer status;

    private LocalDateTime openedAt;

    /** 逻辑删除：0正常 1已删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
