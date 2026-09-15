package com.timecapsule.ai;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * AI 大模型相关配置（对应 application.yml 的 ai.* 前缀）
 */
@Data
@Component
@ConfigurationProperties(prefix = "ai")
public class AiProperties {

    /** OpenAI 兼容的 chat/completions 端点 */
    private String baseUrl = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

    /** API Key，为空表示未配置，对话走兜底文案 */
    private String apiKey = "";

    /** 模型名 */
    private String model = "doubao-seed-1-6-250615";

    /** 采样温度：越低越稳定，越高越发散 */
    private double temperature = 0.7;

    /** 建立连接超时（毫秒） */
    private int connectTimeoutMs = 5000;

    /** 读取响应超时（毫秒） */
    private int readTimeoutMs = 60000;

    /** 注入提示词的最近对话条数 */
    private int historyLimit = 10;

    /** 知识库问答时最多注入的片段数 */
    private int knowledgeLimit = 6;

    /** 是否已配置可用的 API Key */
    public boolean isConfigured() {
        return StringUtils.hasText(apiKey);
    }
}
