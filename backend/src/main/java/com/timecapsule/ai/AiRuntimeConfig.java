package com.timecapsule.ai;

import org.springframework.util.StringUtils;

/**
 * 一次 AI 调用真正生效的配置。
 * <p>
 * 来源优先级：数据库 ai_config 表的非空字段 &gt; application.yml / application-local.yml 的 ai.*。
 * 之所以做成不可变记录，是为了让「读取配置」和「使用配置」分离：
 * 每个请求开始时取一次快照，中途配置被改也不会影响这次调用。
 */
public record AiRuntimeConfig(
        String provider,
        String baseUrl,
        String apiKey,
        String model,
        double temperature,
        int connectTimeoutMs,
        int readTimeoutMs,
        int historyLimit,
        int knowledgeLimit) {

    /** 是否配置了可用的 API Key */
    public boolean isConfigured() {
        return StringUtils.hasText(apiKey);
    }

    /**
     * 由 chat/completions 端点推导出模型列表端点。
     * 例如 https://api.deepseek.com/chat/completions → https://api.deepseek.com/models
     */
    public String modelsUrl() {
        if (!StringUtils.hasText(baseUrl)) {
            return "";
        }
        int index = baseUrl.indexOf("/chat/completions");
        if (index > 0) {
            return baseUrl.substring(0, index) + "/models";
        }
        int slash = baseUrl.lastIndexOf('/');
        return slash > "https://x".length() ? baseUrl.substring(0, slash) + "/models" : baseUrl + "/models";
    }

    /** 用于日志和前端展示的脱敏描述 */
    public String describe() {
        return provider + " / " + model + " / " + baseUrl;
    }
}
