package com.timecapsule.dto;

import com.timecapsule.entity.Persona;

import java.util.List;

/**
 * 分身详情：画像本体 + 它引用了哪些知识库文档
 */
public record PersonaDetail(Persona persona, List<KnowledgeDocView> docs) {
}
