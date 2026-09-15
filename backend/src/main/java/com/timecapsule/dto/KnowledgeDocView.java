package com.timecapsule.dto;

import java.time.LocalDateTime;

/**
 * 知识库文档列表项。
 * <p>
 * 列表不返回全文（正文可能很长），只给一段预览，点开详情才取全文。
 */
public record KnowledgeDocView(
        Long id,
        String title,
        String sourceType,
        Integer charCount,
        String preview,
        LocalDateTime createdAt) {
}
