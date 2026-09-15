package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.timecapsule.common.BusinessException;
import com.timecapsule.dto.KnowledgeDocRequest;
import com.timecapsule.dto.KnowledgeDocView;
import com.timecapsule.entity.KnowledgeDoc;
import com.timecapsule.mapper.KnowledgeDocMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 知识库服务：管理用户导入的个人资料，并负责对话时的片段召回。
 * <p>
 * <b>召回为什么不用向量检索：</b>引入 embedding 需要额外依赖或外部服务，
 * 对一个本地演示项目来说性价比不高。这里用「中文相邻两字（bigram）命中数 / √片段长度」
 * 做关键词打分——零依赖、可解释，对"我的日记""我的自我介绍"这类自述性文本效果够用。
 * 数据量再大就应该换成真正的向量检索。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeService {

    /** 列表里预览的字符数 */
    private static final int PREVIEW_LENGTH = 80;
    /** 单个召回片段的目标长度 */
    private static final int CHUNK_TARGET = 400;

    private final KnowledgeDocMapper docMapper;
    private final UserService userService;

    /** 召回出来的片段 */
    public record RetrievedChunk(String source, String text) {
    }

    private record ScoredChunk(RetrievedChunk chunk, double score) {
    }

    public List<KnowledgeDocView> listByUser(Long userId) {
        requireUserId(userId);
        List<KnowledgeDoc> docs = docMapper.selectList(new LambdaQueryWrapper<KnowledgeDoc>()
                .eq(KnowledgeDoc::getUserId, userId)
                .orderByDesc(KnowledgeDoc::getCreatedAt));
        return docs.stream().map(this::toView).toList();
    }

    /** 取全文（详情用），同时校验归属 */
    public KnowledgeDoc getOwned(Long id, Long userId) {
        if (id == null || userId == null) {
            throw new BusinessException("文档ID和用户ID不能为空");
        }
        KnowledgeDoc doc = docMapper.selectOne(new LambdaQueryWrapper<KnowledgeDoc>()
                .eq(KnowledgeDoc::getId, id)
                .eq(KnowledgeDoc::getUserId, userId));
        if (doc == null) {
            throw new BusinessException(404, "文档不存在或不属于当前用户");
        }
        return doc;
    }

    @Transactional(rollbackFor = Exception.class)
    public KnowledgeDocView create(KnowledgeDocRequest request) {
        userService.getById(request.getUserId());

        KnowledgeDoc doc = new KnowledgeDoc();
        doc.setUserId(request.getUserId());
        doc.setTitle(request.getTitle().trim());
        doc.setContent(request.getContent().trim());
        doc.setSourceType(StringUtils.hasText(request.getSourceType())
                ? request.getSourceType().trim() : KnowledgeDoc.SOURCE_PASTE);
        doc.setCharCount(doc.getContent().length());
        doc.setDeleted(0);
        docMapper.insert(doc);
        log.info("用户 {} 导入知识库文档《{}》，{} 字", request.getUserId(), doc.getTitle(), doc.getCharCount());
        return toView(doc);
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id, Long userId) {
        getOwned(id, userId);
        docMapper.deleteById(id);
    }

    /** 按 id 集合取自己名下的文档（创建分身时用） */
    public List<KnowledgeDoc> listOwnedDocs(Long userId, List<Long> docIds) {
        if (docIds == null || docIds.isEmpty()) {
            return List.of();
        }
        return docMapper.selectList(new LambdaQueryWrapper<KnowledgeDoc>()
                .eq(KnowledgeDoc::getUserId, userId)
                .in(KnowledgeDoc::getId, docIds));
    }

    /**
     * 按 id 集合取文档视图。
     * 不校验用户归属 —— 调用方（分身详情）已经校验过分身属于当前用户，
     * 关联表里的 docId 也只可能是该用户自己的文档。
     */
    public List<KnowledgeDocView> listViewsByIds(List<Long> docIds) {
        if (docIds == null || docIds.isEmpty()) {
            return List.of();
        }
        return docMapper.selectBatchIds(docIds).stream()
                .sorted(Comparator.comparing(KnowledgeDoc::getId))
                .map(this::toView)
                .toList();
    }

    public List<KnowledgeDoc> listAllOwned(Long userId) {
        return docMapper.selectList(new LambdaQueryWrapper<KnowledgeDoc>()
                .eq(KnowledgeDoc::getUserId, userId)
                .orderByAsc(KnowledgeDoc::getId));
    }

    public int countByUser(Long userId) {
        Long count = docMapper.selectCount(new LambdaQueryWrapper<KnowledgeDoc>()
                .eq(KnowledgeDoc::getUserId, userId));
        return count == null ? 0 : count.intValue();
    }

    /**
     * 按关键词召回与 query 最相关的若干片段。
     *
     * @return 按相关度降序，最多 limit 条；没有命中时返回空列表（调用方不要注入空上下文）
     */
    public List<RetrievedChunk> retrieve(Long userId, String query, int limit) {
        if (!StringUtils.hasText(query) || limit <= 0) {
            return List.of();
        }
        Set<String> queryGrams = bigrams(query);
        if (queryGrams.isEmpty()) {
            return List.of();
        }

        List<ScoredChunk> scored = new ArrayList<>();
        for (KnowledgeDoc doc : listAllOwned(userId)) {
            for (String chunk : chunk(doc.getContent())) {
                int hit = 0;
                for (String gram : queryGrams) {
                    if (chunk.contains(gram)) {
                        hit++;
                    }
                }
                if (hit > 0) {
                    // 除以 √长度，避免长片段仅因为字多就排到前面
                    double score = hit / Math.sqrt(Math.max(1, chunk.length()));
                    scored.add(new ScoredChunk(new RetrievedChunk(doc.getTitle(), chunk), score));
                }
            }
        }

        scored.sort(Comparator.comparingDouble(ScoredChunk::score).reversed());
        List<RetrievedChunk> result = new ArrayList<>();
        for (int i = 0; i < Math.min(limit, scored.size()); i++) {
            result.add(scored.get(i).chunk());
        }
        return result;
    }

    /**
     * 中文相邻两字切片（bigram）。中文没有空格分词，用 bigram 近似关键词，
     * 只保留汉字与字母数字，标点和空白一律丢弃。
     */
    static Set<String> bigrams(String text) {
        String cleaned = text.replaceAll("[^\\p{IsHan}\\p{Alnum}]", "");
        Set<String> grams = new LinkedHashSet<>();
        for (int i = 0; i + 2 <= cleaned.length(); i++) {
            grams.add(cleaned.substring(i, i + 2));
        }
        return grams;
    }

    /** 按空行/换行切段，再合并到约 CHUNK_TARGET 字一片 */
    static List<String> chunk(String content) {
        List<String> chunks = new ArrayList<>();
        if (!StringUtils.hasText(content)) {
            return chunks;
        }
        StringBuilder buffer = new StringBuilder();
        for (String raw : content.split("\\n+")) {
            String line = raw.trim();
            if (line.isEmpty()) {
                continue;
            }
            if (buffer.length() > 0 && buffer.length() + line.length() > CHUNK_TARGET) {
                chunks.add(buffer.toString());
                buffer.setLength(0);
            }
            if (buffer.length() > 0) {
                buffer.append('\n');
            }
            buffer.append(line);
        }
        if (buffer.length() > 0) {
            chunks.add(buffer.toString());
        }
        return chunks;
    }

    private KnowledgeDocView toView(KnowledgeDoc doc) {
        String content = doc.getContent() == null ? "" : doc.getContent();
        String preview = content.replaceAll("\\s+", " ").trim();
        if (preview.length() > PREVIEW_LENGTH) {
            preview = preview.substring(0, PREVIEW_LENGTH) + "…";
        }
        return new KnowledgeDocView(doc.getId(), doc.getTitle(), doc.getSourceType(),
                doc.getCharCount(), preview, doc.getCreatedAt());
    }

    private void requireUserId(Long userId) {
        if (userId == null) {
            throw new BusinessException("userId 不能为空");
        }
    }
}
