package com.timecapsule.ai;

import com.timecapsule.service.AiConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 应用层的 AI 客户端（门面）。
 * <p>
 * 与 {@link AiHttpClient} 的分工：
 * <ul>
 *   <li>{@code AiHttpClient} 只负责「按给定配置发一次 HTTP 请求」，自己不读配置</li>
 *   <li>{@code AIClient} 负责「先解析出当前生效的配置，再发请求」</li>
 * </ul>
 * 业务代码（对话、人格蒸馏）统一用这个门面，不需要关心配置是来自数据库还是配置文件。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AIClient {

    private final AiConfigService aiConfigService;
    private final AiHttpClient httpClient;

    /** 当前生效配置快照 */
    public AiRuntimeConfig effective() {
        return aiConfigService.effective();
    }

    /** 是否配置了可用的 API Key */
    public boolean isConfigured() {
        return effective().isConfigured();
    }

    /** 当前生效的模型名（写入画像记录用） */
    public String effectiveModel() {
        return effective().model();
    }

    /** 注入提示词的最近对话条数 */
    public int historyLimit() {
        return effective().historyLimit();
    }

    /** 知识库召回时最多注入的片段数 */
    public int knowledgeLimit() {
        return effective().knowledgeLimit();
    }

    /**
     * 调用大模型，返回回复文本。
     *
     * @param messages OpenAI 格式消息列表，第一项通常是 system
     * @throws com.timecapsule.common.BusinessException 未配置 key、网络失败、供应商返回错误等
     */
    public String chat(List<Map<String, String>> messages) {
        return httpClient.chat(effective(), messages);
    }
}
