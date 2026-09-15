package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.timecapsule.ai.AIClient;
import com.timecapsule.common.BusinessException;
import com.timecapsule.entity.KnowledgeDoc;
import com.timecapsule.entity.Persona;
import com.timecapsule.entity.PersonaDoc;
import com.timecapsule.mapper.KnowledgeDocMapper;
import com.timecapsule.mapper.PersonaDocMapper;
import com.timecapsule.mapper.PersonaMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 「自己的分身」生成器：把知识库蒸馏成一份可角色扮演的人物档案。
 * <p>
 * 为什么是异步的：一次蒸馏要把几千字材料发给大模型，实测十几秒到一分钟。
 * 如果同步做，接口会长时间挂住、前端只能转圈。这里改成
 * 「建记录（GENERATING）→ 后台线程生成 → 回写 READY/FAILED」，
 * 前端轮询状态即可。
 * <p>
 * 没有用 {@code @Async}：在本类里自己持有一个小线程池更直观，
 * 也避免 @Async + @Transactional 代理失效、事务边界不清这些坑。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PersonaGenerator {

    private static final String SUMMARY_MARK = "【画像】";
    private static final String STYLE_MARK = "【风格】";
    /** 送给模型的知识库总字数上限，防止把上下文撑爆 */
    private static final int DOC_CHAR_BUDGET = 6000;
    /** 失败原因最多保留的长度 */
    private static final int FAIL_REASON_MAX = 400;

    private static final String DEFAULT_STYLE =
            "语气真诚、温和，先承认对方的处境再回应；回答控制在 150 字以内，不使用 Markdown 标题和列表。";

    private static final String SYSTEM_PROMPT = """
            你是一位擅长人物画像的心理侧写师。用户会给你一批「他自己写的」材料：自我介绍、日记、笔记、计划等。
            你的任务是把这些材料蒸馏成一份可用于角色扮演的「人物档案」，让另一个 AI 能据此像这个人本人一样说话。

            严格遵守：
            - 只依据材料中真实出现的内容推断，不要臆造经历、喜好或事实
            - 用第三人称描述这个人，不要用「我」
            - 注意材料反映的是哪个人生阶段，不要把不同时期的特征混在一起
            - 输出必须且只有两段，分别以【画像】和【风格】开头，不要写任何额外说明""";

    private final PersonaMapper personaMapper;
    private final PersonaDocMapper personaDocMapper;
    private final KnowledgeDocMapper docMapper;
    private final AIClient aiClient;

    private final ExecutorService executor = Executors.newFixedThreadPool(2, new ThreadFactory() {
        private final AtomicInteger counter = new AtomicInteger();

        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "persona-gen-" + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        }
    });

    /**
     * 应用启动时把「上次被中断、还停在 GENERATING」的记录标成失败。
     * 否则服务重启后这些分身会永远卡在"生成中"，前端一直转圈。
     */
    @PostConstruct
    void resetStuckPersonas() {
        try {
            int reset = personaMapper.update(null, new LambdaUpdateWrapper<Persona>()
                    .eq(Persona::getStatus, Persona.STATUS_GENERATING)
                    .set(Persona::getStatus, Persona.STATUS_FAILED)
                    .set(Persona::getFailReason, "服务重启导致生成中断，请点「重新生成」"));
            if (reset > 0) {
                log.warn("发现 {} 个中断的分身生成任务，已重置为失败", reset);
            }
        } catch (Exception e) {
            log.warn("重置中断的分身生成任务失败：{}", e.getMessage());
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    /** 提交一个后台生成任务，立即返回 */
    public void generateAsync(Long personaId) {
        executor.submit(() -> generate(personaId));
    }

    /** 真正的生成逻辑：取材料 → 调模型 → 解析 → 回写状态 */
    void generate(Long personaId) {
        Persona persona = personaMapper.selectById(personaId);
        if (persona == null) {
            log.warn("分身 {} 已不存在，跳过生成", personaId);
            return;
        }

        try {
            List<KnowledgeDoc> docs = loadDocs(personaId);
            if (docs.isEmpty()) {
                throw new BusinessException("没有可用的知识库文档");
            }

            String reply = aiClient.chat(List.of(
                    Map.of("role", "system", "content", SYSTEM_PROMPT),
                    Map.of("role", "user", "content", buildUserPrompt(persona, docs))));

            String[] parsed = parse(reply);
            updateResult(personaId, Persona.STATUS_READY, parsed[0], parsed[1], null, aiClient.effectiveModel());
            log.info("分身 {}《{}》生成完成", personaId, persona.getName());
        } catch (Exception e) {
            String reason = abbreviate(e.getMessage());
            log.warn("分身 {} 生成失败：{}", personaId, reason);
            updateResult(personaId, Persona.STATUS_FAILED, null, null, reason, null);
        }
    }

    private List<KnowledgeDoc> loadDocs(Long personaId) {
        List<PersonaDoc> links = personaDocMapper.selectList(new LambdaQueryWrapper<PersonaDoc>()
                .eq(PersonaDoc::getPersonaId, personaId));
        if (links.isEmpty()) {
            return List.of();
        }
        List<Long> docIds = links.stream().map(PersonaDoc::getDocId).toList();
        List<KnowledgeDoc> docs = new ArrayList<>(docMapper.selectBatchIds(docIds));
        docs.sort(Comparator.comparing(KnowledgeDoc::getId));
        return docs;
    }

    private String buildUserPrompt(Persona persona, List<KnowledgeDoc> docs) {
        StringBuilder builder = new StringBuilder();
        builder.append("这个分身代表的人生阶段：").append(persona.getSelfDate())
                .append("（命名为「").append(persona.getName()).append("」）\n\n");
        builder.append("材料如下：\n");

        int budget = DOC_CHAR_BUDGET;
        for (KnowledgeDoc doc : docs) {
            String content = doc.getContent() == null ? "" : doc.getContent();
            String slice = content.length() <= budget ? content : content.substring(0, Math.max(0, budget));
            builder.append("\n《").append(doc.getTitle()).append("》\n").append(slice).append('\n');
            budget -= slice.length();
            if (budget <= 0) {
                builder.append("\n（材料已达长度上限，其余内容省略）\n");
                break;
            }
        }

        builder.append("\n请输出：\n\n")
                .append(SUMMARY_MARK).append('\n')
                .append("这个人的性格、在意什么、不在意什么、正在经历什么、有哪些长期的焦虑与愿望。250 字以内。\n\n")
                .append(STYLE_MARK).append('\n')
                .append("这个人说话的语气、常用词、句子长短，以及面对挫败/犹豫/开心时的反应方式。150 字以内。");
        return builder.toString();
    }

    /**
     * 解析模型输出。
     * <p>
     * 没有用 JSON：让大模型输出中文 JSON 经常混进多余文字或转义问题，
     * 用固定标记切段更稳；万一标记也没了，就整段当画像，风格用默认值，
     * 至少不会因为解析失败让整个功能不可用。
     */
    private String[] parse(String raw) {
        String text = raw == null ? "" : raw.trim();
        String summary = section(text, SUMMARY_MARK, STYLE_MARK).trim();
        String style = section(text, STYLE_MARK, null).trim();

        if (!StringUtils.hasText(summary)) {
            summary = text;
        }
        if (!StringUtils.hasText(style)) {
            style = DEFAULT_STYLE;
        }
        return new String[]{limit(summary, 2000), limit(style, 1000)};
    }

    private String section(String text, String startMark, String endMark) {
        int start = text.indexOf(startMark);
        if (start < 0) {
            return "";
        }
        start += startMark.length();
        int end = endMark == null ? -1 : text.indexOf(endMark, start);
        if (end < 0) {
            end = text.length();
        }
        return text.substring(start, end);
    }

    /** 显式 set 每个字段（包括 null），这样成功时能把上次的 fail_reason 清掉 */
    private void updateResult(Long personaId, String status, String summary,
                              String stylePrompt, String failReason, String model) {
        personaMapper.update(null, new LambdaUpdateWrapper<Persona>()
                .eq(Persona::getId, personaId)
                .set(Persona::getStatus, status)
                .set(Persona::getSummary, summary)
                .set(Persona::getStylePrompt, stylePrompt)
                .set(Persona::getFailReason, failReason)
                .set(model != null, Persona::getModel, model));
    }

    private String limit(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max);
    }

    private String abbreviate(String message) {
        String text = message == null ? "未知错误" : message.trim();
        return text.length() <= FAIL_REASON_MAX ? text : text.substring(0, FAIL_REASON_MAX) + "…";
    }
}
