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
 * 知识库文档：用户导入的个人资料，是生成「自己的分身」的原料
 */
@Data
@TableName("knowledge_docs")
public class KnowledgeDoc {

    /** 来源：直接粘贴 */
    public static final String SOURCE_PASTE = "PASTE";
    /** 来源：上传文件 */
    public static final String SOURCE_FILE = "FILE";

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String title;

    /** 正文（纯文本） */
    private String content;

    /** PASTE / FILE */
    private String sourceType;

    /** 正文字数 */
    private Integer charCount;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
