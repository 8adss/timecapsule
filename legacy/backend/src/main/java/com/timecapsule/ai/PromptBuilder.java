package com.timecapsule.ai;

import com.timecapsule.entity.Dialogue;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 提示词构建器：组装"过去的你"角色设定与心理学策略。
 * <p>
 * 核心公式：系统提示词 = 角色设定 + 时间胶囊原文 + 任务背景 + 心理学策略。
 * 多轮对话的历史消息由 ChatService 负责拼进 messages，不在这里重复塞胶囊原文
 * （初版把胶囊原文同时写进 system 和 user 消息，等于白花一倍 token）。
 */
@Component
public class PromptBuilder {

    /**
     * 构建"过去的你"系统角色提示词。
     *
     * @param capsuleContent 时间胶囊原文（写给未来的话）
     * @param writeDate      写下这段话的时间
     * @param taskTitle      关联任务名称（没有关联任务时传"一个心愿"）
     * @param taskStatusDesc 任务当前状态描述，例如"进行中，截止 2026-10-01"
     */
    public String buildPastSelfSystem(String capsuleContent, String writeDate,
                                      String taskTitle, String taskStatusDesc) {
        return "你是用户的\"过去的自己\"。\n"
                + "用户在 " + writeDate + " 写下了这段话：「" + capsuleContent + "」，"
                + "当时 TA 正在为任务「" + taskTitle + "」努力。\n"
                + "现在距离写下这段话已经过去了一段时间，任务目前的状态是：" + taskStatusDesc + "。\n"
                + "请以当时的 TA 的身份与现在的用户对话：\n"
                + "- 用第一人称\"我\"指代当时的自己，用\"你\"指代现在的用户\n"
                + "- 语气真诚、温和、带着期待与关心，不评判、不指责\n"
                + "- 先回顾当时的期待，再询问现在的进展，最后给予共情与鼓励\n"
                + "- 不虚构事实，不提供虚假安慰；不代替用户做决定\n"
                + "- 若用户流露挫败情绪，先共情，再引用其已完成的部分给予胜任感\n"
                + "- 若用户犹豫拖延，重申决定权在用户自己手中，呼应当初的期待\n"
                + "- 若用户感到孤独缺乏动力，以长期见证者的口吻给予归属感\n"
                + "- 回答控制在 150 字以内，不要写成说教长文，不要使用 Markdown 标题和列表";
    }

    /**
     * 构建「何时的自己」系统角色提示词（v2 分身对话）。
     * <p>
     * 与「过去的你」的区别：人设不再来自一段胶囊原文，而是来自知识库蒸馏出的
     * 画像 + 说话风格，再按当前这句话召回相关的事实材料作为依据。
     *
     * @param personaName        分身名称，如「2026 年 9 月的我」
     * @param selfDate           该分身代表的时间点
     * @param summary            LLM 蒸馏出的画像
     * @param stylePrompt        LLM 蒸馏出的说话风格
     * @param knowledgeSnippets  按当前消息召回的知识库片段（可为空）
     */
    public String buildPersonaSystem(String personaName, String selfDate, String summary,
                                     String stylePrompt, List<String> knowledgeSnippets) {
        StringBuilder builder = new StringBuilder();
        builder.append("你就是用户的「").append(personaName).append("」——")
                .append(selfDate).append(" 那个时候的 TA 本人。\n")
                .append("现在用户在和你说话，你要用第一人称「我」，以那个时间点的自己的身份回应。\n\n");

        builder.append("【你的人物档案】\n")
                .append(StringUtils.hasText(summary) ? summary.trim() : "（暂无画像，请依据材料自然表达）")
                .append("\n\n");

        if (StringUtils.hasText(stylePrompt)) {
            builder.append("【你的说话风格】\n").append(stylePrompt.trim()).append("\n\n");
        }

        if (knowledgeSnippets != null && !knowledgeSnippets.isEmpty()) {
            builder.append("【你记得的事实材料】\n");
            for (String snippet : knowledgeSnippets) {
                builder.append("- ").append(snippet.replaceAll("\\s+", " ").trim()).append('\n');
            }
            builder.append("这些是你自己经历过的事，可以自然地提起，")
                    .append("但不要原样背诵，也不要编造材料里没有的经历。\n\n");
        }

        builder.append("""
                对话要求：
                - 用第一人称「我」指代自己，用「你」指代现在的用户
                - 保持档案里的人设和说话风格，不要退化成通用助手
                - 先接住对方的情绪，再回应内容；不评判、不指责
                - 不虚构事实，不确定的事就直说不知道
                - 回答控制在 150 字以内，不要使用 Markdown 标题和列表""");
        return builder.toString();
    }

    /**
     * 把数据库里的对话记录转换成 OpenAI 的 messages 格式，
     * 角色映射：user → user，"过去的你"/"何时的自己" → assistant。
     *
     * @param history 按时间正序排列的历史对话（不含本轮用户消息）
     */
    public List<Map<String, String>> buildHistoryMessages(List<Dialogue> history) {
        List<Map<String, String>> messages = new ArrayList<>();
        for (Dialogue dialogue : history) {
            String role = Dialogue.ROLE_USER.equals(dialogue.getRole()) ? "user" : "assistant";
            messages.add(Map.of("role", role, "content", dialogue.getContent()));
        }
        return messages;
    }
}
