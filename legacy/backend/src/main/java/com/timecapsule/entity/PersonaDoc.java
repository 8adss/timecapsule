package com.timecapsule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 分身 ↔ 知识库文档 关联表
 */
@Data
@TableName("persona_docs")
public class PersonaDoc {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long personaId;

    private Long docId;
}
