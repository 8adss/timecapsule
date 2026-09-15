package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.timecapsule.ai.AIClient;
import com.timecapsule.ai.PromptBuilder;
import com.timecapsule.common.BusinessException;
import com.timecapsule.entity.Dialogue;
import com.timecapsule.entity.Persona;
import com.timecapsule.entity.Task;
import com.timecapsule.entity.TimeCapsule;
import com.timecapsule.mapper.DialogueMapper;
import com.timecapsule.mapper.TaskMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * AI 对话服务：两种对话对象共用这里。
 * <ul>
 *   <li><b>与「过去的你」对话</b>：人设来自一枚时间胶囊的原文（{@link #chatWithPastSelf}）</li>
 *   <li><b>与「何时的自己」对话</b>：人设来自知识库蒸馏出的分身画像（{@link #chatWithPersona}）</li>
 * </ul>
 * <p>
 * 两点刻意的设计：
 * <ol>
 *   <li><b>不加 @Transactional</b>：AI 调用最长可能等 90 秒，放进事务里会白占一条数据库连接，
 *       也让用户消息跟着一起回滚。现在用户消息先落库，AI 失败时仍然保留，并落一条兜底回复。</li>
 *   <li><b>注入最近 N 条历史</b>：初版每轮都只发当前一句，模型完全不记得上下文，多轮对话形同虚设。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private static final DateTimeFormatter WRITE_DATE_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private static final String FALLBACK_PAST_SELF =
            "（AI 服务暂不可用，这是兜底回复）我是过去的你。还记得当时写下的那句话吗？"
                    + "无论走到哪一步，都值得为自己高兴。";

    private static final String FALLBACK_PERSONA =
            "（AI 服务暂不可用，这是兜底回复）我是那个时候的你。"
                    + "你写下的那些话我都还记得，等你方便的时候再聊。";

    private final DialogueMapper dialogueMapper;
    private final TaskMapper taskMapper;
    private final CapsuleService capsuleService;
    private final PersonaService personaService;
    private final KnowledgeService knowledgeService;
    private final AIClient aiClient;
    private final PromptBuilder promptBuilder;

    // ============================================================
    // 一、与「过去的你」对话（基于时间胶囊）
    // ============================================================

    /**
     * 与"过去的你"对话。
     *
     * @param userId    用户ID
     * @param capsuleId 胶囊ID（必须属于该用户且已开启）
     * @param message   用户消息
     * @return AI 回复记录
     */
    public Dialogue chatWithPastSelf(Long userId, Long capsuleId, String message) {
        TimeCapsule capsule = requireOpenedOwnedCapsule(userId, capsuleId);

        // 1. 先取历史（此时还没插入本轮用户消息，天然不含当前这句）
        List<Dialogue> history = recentHistory(userId, capsuleId, null);

        // 2. 保存用户消息，保证"用户说过的话"一定落库
        Dialogue userDialogue = new Dialogue();
        userDialogue.setUserId(userId);
        userDialogue.setCapsuleId(capsuleId);
        userDialogue.setRole(Dialogue.ROLE_USER);
        userDialogue.setContent(message.trim());
        userDialogue.setEmotionTag(detectEmotion(message));
        dialogueMapper.insert(userDialogue);

        // 3. 组装上下文：system(人设+胶囊原文) + 历史多轮 + 本轮消息
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", buildPastSelfSystemPrompt(capsule)));
        messages.addAll(promptBuilder.buildHistoryMessages(history));
        messages.add(Map.of("role", "user", "content", message.trim()));

        // 4. 调用大模型 + 保存回复
        String reply = askAI(messages, FALLBACK_PAST_SELF);

        Dialogue aiDialogue = new Dialogue();
        aiDialogue.setUserId(userId);
        aiDialogue.setCapsuleId(capsuleId);
        aiDialogue.setRole(Dialogue.ROLE_AI);
        aiDialogue.setContent(reply);
        dialogueMapper.insert(aiDialogue);
        return aiDialogue;
    }

    /** 某胶囊下的完整对话历史（校验归属） */
    public List<Dialogue> history(Long userId, Long capsuleId) {
        capsuleService.getOwned(capsuleId, userId);
        return dialogueMapper.selectList(new LambdaQueryWrapper<Dialogue>()
                .eq(Dialogue::getUserId, userId)
                .eq(Dialogue::getCapsuleId, capsuleId)
                .orderByAsc(Dialogue::getCreatedAt)
                .orderByAsc(Dialogue::getId));
    }

    // ============================================================
    // 二、与「何时的自己」对话（基于知识库分身）
    // ============================================================

    /**
     * 与"何时的自己"对话。
     * <p>
     * 比胶囊对话多一步：按用户这句话去知识库里召回相关片段，
     * 让分身能引用"自己真实经历过的事"，而不是空有人格没有记忆。
     *
     * @param userId    用户ID
     * @param personaId 分身ID（必须属于该用户且状态为 READY）
     * @param message   用户消息
     * @return AI 回复记录
     */
    public Dialogue chatWithPersona(Long userId, Long personaId, String message) {
        Persona persona = personaService.getReady(personaId, userId);

        List<Dialogue> history = recentHistory(userId, null, personaId);

        Dialogue userDialogue = new Dialogue();
        userDialogue.setUserId(userId);
        userDialogue.setPersonaId(personaId);
        userDialogue.setRole(Dialogue.ROLE_USER);
        userDialogue.setContent(message.trim());
        userDialogue.setEmotionTag(detectEmotion(message));
        dialogueMapper.insert(userDialogue);

        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", buildPersonaSystemPrompt(persona, message)));
        messages.addAll(promptBuilder.buildHistoryMessages(history));
        messages.add(Map.of("role", "user", "content", message.trim()));

        String reply = askAI(messages, FALLBACK_PERSONA);

        Dialogue aiDialogue = new Dialogue();
        aiDialogue.setUserId(userId);
        aiDialogue.setPersonaId(personaId);
        aiDialogue.setRole(Dialogue.ROLE_PERSONA);
        aiDialogue.setContent(reply);
        dialogueMapper.insert(aiDialogue);
        return aiDialogue;
    }

    /** 某分身下的完整对话历史（校验归属） */
    public List<Dialogue> personaHistory(Long userId, Long personaId) {
        personaService.getOwned(personaId, userId);
        return dialogueMapper.selectList(new LambdaQueryWrapper<Dialogue>()
                .eq(Dialogue::getUserId, userId)
                .eq(Dialogue::getPersonaId, personaId)
                .orderByAsc(Dialogue::getCreatedAt)
                .orderByAsc(Dialogue::getId));
    }

    // ============================================================
    // 内部实现
    // ============================================================

    /** 统一的大模型调用与兜底逻辑 */
    private String askAI(List<Map<String, String>> messages, String fallback) {
        if (!aiClient.isConfigured()) {
            return fallback;
        }
        try {
            return aiClient.chat(messages);
        } catch (Exception e) {
            log.warn("AI 调用失败，使用兜底回复：{}", e.getMessage());
            return fallback + "\n\n（失败原因：" + e.getMessage() + "）";
        }
    }

    /** 胶囊必须属于该用户，且已经开启，才允许对话 */
    private TimeCapsule requireOpenedOwnedCapsule(Long userId, Long capsuleId) {
        TimeCapsule capsule = capsuleService.getOwned(capsuleId, userId);
        if (!Objects.equals(capsule.getStatus(), TimeCapsule.STATUS_OPENED)) {
            throw new BusinessException("胶囊还没有开启，暂时不能与过去的你对话");
        }
        return capsule;
    }

    /**
     * 取最近 N 条历史，按时间正序返回（给模型的时间顺序）。
     * 胶囊对话与分身对话各查各的，靠 capsuleId / personaId 二选一区分。
     */
    private List<Dialogue> recentHistory(Long userId, Long capsuleId, Long personaId) {
        int limit = aiClient.historyLimit();
        if (limit <= 0) {
            return List.of();
        }
        LambdaQueryWrapper<Dialogue> wrapper = new LambdaQueryWrapper<Dialogue>()
                .eq(Dialogue::getUserId, userId)
                .eq(capsuleId != null, Dialogue::getCapsuleId, capsuleId)
                .eq(personaId != null, Dialogue::getPersonaId, personaId)
                .orderByDesc(Dialogue::getCreatedAt)
                .orderByDesc(Dialogue::getId)
                .last("LIMIT " + limit);
        List<Dialogue> latest = dialogueMapper.selectList(wrapper);
        Collections.reverse(latest);
        return latest;
    }

    private String buildPastSelfSystemPrompt(TimeCapsule capsule) {
        return promptBuilder.buildPastSelfSystem(
                capsule.getContent(),
                formatTime(capsule.getCreatedAt()),
                resolveTaskTitle(capsule.getTaskId()),
                describeTask(capsule.getTaskId()));
    }

    private String buildPersonaSystemPrompt(Persona persona, String message) {
        // 按当前这句话召回知识库片段，作为分身"记得的事"
        List<String> snippets = knowledgeService
                .retrieve(persona.getUserId(), message, aiClient.knowledgeLimit())
                .stream()
                .map(chunk -> "《" + chunk.source() + "》" + chunk.text())
                .toList();
        if (!snippets.isEmpty()) {
            log.debug("分身 {} 对话召回知识片段 {} 条", persona.getId(), snippets.size());
        }

        return promptBuilder.buildPersonaSystem(
                persona.getName(),
                persona.getSelfDate() == null ? "过去某个时间点" : persona.getSelfDate().toString(),
                persona.getSummary(),
                persona.getStylePrompt(),
                snippets);
    }

    private String resolveTaskTitle(Long taskId) {
        if (taskId == null) {
            return "一个心愿";
        }
        Task task = taskMapper.selectById(taskId);
        return task == null ? "一个心愿" : task.getTitle();
    }

    /** 把关联任务的当前状态描述给模型，让它知道用户后来做得怎么样 */
    private String describeTask(Long taskId) {
        if (taskId == null) {
            return "这是一枚独立胶囊，没有关联具体任务";
        }
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            return "关联的任务已被删除";
        }
        String status = switch (task.getStatus() == null ? -1 : task.getStatus()) {
            case Task.STATUS_ONGOING -> "进行中";
            case Task.STATUS_DONE -> "已完成";
            case Task.STATUS_OVERDUE -> "已逾期未完成";
            case Task.STATUS_ABANDONED -> "已放弃";
            default -> "状态未知";
        };
        StringBuilder desc = new StringBuilder(status);
        if (task.getDueDate() != null) {
            desc.append("，截止时间 ").append(formatTime(task.getDueDate()));
        }
        if (task.getCompletedAt() != null) {
            desc.append("，完成于 ").append(formatTime(task.getCompletedAt()));
        }
        return desc.toString();
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? "未知时间" : time.format(WRITE_DATE_FORMATTER);
    }

    /**
     * 简单情绪识别（骨架）：后续可接入情绪分类模型。
     * 用户消息会打标签，方便"我的"页面统计情绪分布。
     */
    private String detectEmotion(String message) {
        if (message == null) {
            return "平静";
        }
        if (containsAny(message, "失败", "没做到", "搞砸", "好难", "做不到", "没用")) {
            return "挫败";
        }
        if (containsAny(message, "要不要", "犹豫", "坚持", "是不是", "该不该")) {
            return "犹豫";
        }
        if (containsAny(message, "一个人", "孤独", "没劲", "没人", "空虚")) {
            return "孤独";
        }
        if (containsAny(message, "完成", "做到了", "开心", "过了", "成功", "谢谢")) {
            return "喜悦";
        }
        return "平静";
    }

    private boolean containsAny(String text, String... keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }
}
