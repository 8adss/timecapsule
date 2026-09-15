package com.timecapsule.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.timecapsule.common.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 底层传输层：只认「显式传入的配置」，自己不读数据库。
 * <p>
 * 这样拆分的意义：{@code AiConfigService} 需要「测试一份还没保存的配置」，
 * 如果它依赖 AIClient、AIClient 又依赖它，就会形成循环依赖。
 * 现在依赖方向是单向的：AiConfigService → AiHttpClient，AIClient → 两者。
 */
@Slf4j
@Component
public class AiHttpClient {

    /** 错误信息里最多保留的原始响应长度 */
    private static final int RAW_RESPONSE_MAX = 300;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 按超时组合缓存 RestTemplate：同一份超时配置只构建一次 */
    private volatile RestTemplate cachedTemplate;
    private volatile int cachedConnectMs = -1;
    private volatile int cachedReadMs = -1;

    /**
     * 调一次 chat/completions。
     *
     * @param config  生效配置
     * @param messages OpenAI 格式消息列表，第一项通常是 system
     * @return 模型回复正文
     * @throws BusinessException 未配置 key、网络失败、供应商返回错误、响应结构异常
     */
    public String chat(AiRuntimeConfig config, List<Map<String, String>> messages) {
        if (!config.isConfigured()) {
            throw new BusinessException("AI 服务未配置 API Key，请到「设置」页面填写");
        }

        Map<String, Object> body = new HashMap<>();
        body.put("model", config.model());
        body.put("messages", messages);
        body.put("temperature", config.temperature());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(config.apiKey());

        String payload;
        try {
            payload = objectMapper.writeValueAsString(body);
        } catch (JsonProcessingException e) {
            throw new BusinessException("构造 AI 请求失败：" + e.getOriginalMessage());
        }

        String response;
        try {
            response = template(config).postForObject(
                    config.baseUrl(), new HttpEntity<>(payload, headers), String.class);
        } catch (RestClientException e) {
            throw new BusinessException("调用 AI 服务失败：" + e.getMessage());
        }
        return extractContent(response);
    }

    /**
     * 拉取该端点支持的模型列表（OpenAI 兼容的 GET /models）。
     * 失败时抛 BusinessException，由调用方决定是否降级为"手填模型名"。
     */
    public List<String> listModels(AiRuntimeConfig config) {
        if (!config.isConfigured()) {
            throw new BusinessException("AI 服务未配置 API Key，请先填写后再拉取模型列表");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(config.apiKey());

        String response;
        try {
            ResponseEntity<String> entity = template(config).exchange(
                    config.modelsUrl(), HttpMethod.GET, new HttpEntity<>(headers), String.class);
            response = entity.getBody();
        } catch (RestClientException e) {
            throw new BusinessException("拉取模型列表失败：" + e.getMessage());
        }

        if (!StringUtils.hasText(response)) {
            throw new BusinessException("模型列表接口返回了空响应");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(response);
        } catch (JsonProcessingException e) {
            throw new BusinessException("模型列表无法解析：" + abbreviate(response));
        }

        JsonNode error = root.path("error");
        if (!error.isMissingNode() && !error.isNull()) {
            throw new BusinessException("模型列表接口返回错误：" + error.path("message").asText(error.toString()));
        }

        JsonNode data = root.path("data");
        if (!data.isArray()) {
            throw new BusinessException("模型列表结构不符合预期：" + abbreviate(response));
        }

        List<String> models = new ArrayList<>();
        for (JsonNode item : data) {
            String id = item.path("id").asText("");
            if (StringUtils.hasText(id)) {
                models.add(id);
            }
        }
        return models;
    }

    /** 从 OpenAI 兼容响应中取出正文，结构不对时给出可排查的报错 */
    private String extractContent(String response) {
        if (!StringUtils.hasText(response)) {
            throw new BusinessException("AI 服务返回了空响应");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(response);
        } catch (JsonProcessingException e) {
            throw new BusinessException("AI 返回内容无法解析：" + abbreviate(response));
        }

        // 供应商的错误响应，例如 {"error":{"message":"...","type":"..."}}
        JsonNode error = root.path("error");
        if (!error.isMissingNode() && !error.isNull()) {
            String message = error.path("message").asText(error.toString());
            throw new BusinessException("AI 服务返回错误：" + message);
        }

        JsonNode choices = root.path("choices");
        if (!choices.isArray() || choices.isEmpty()) {
            throw new BusinessException("AI 返回结果中没有 choices：" + abbreviate(response));
        }

        String content = choices.get(0).path("message").path("content").asText("");
        if (!StringUtils.hasText(content)) {
            throw new BusinessException("AI 返回的回复内容为空：" + abbreviate(response));
        }
        return content.trim();
    }

    /** 同一组超时只构建一个 RestTemplate，配置改了会自动重建 */
    private RestTemplate template(AiRuntimeConfig config) {
        int connect = config.connectTimeoutMs();
        int read = config.readTimeoutMs();
        RestTemplate local = cachedTemplate;
        if (local == null || connect != cachedConnectMs || read != cachedReadMs) {
            synchronized (this) {
                if (cachedTemplate == null || connect != cachedConnectMs || read != cachedReadMs) {
                    cachedTemplate = new RestTemplateBuilder()
                            .setConnectTimeout(Duration.ofMillis(connect))
                            .setReadTimeout(Duration.ofMillis(read))
                            .build();
                    cachedConnectMs = connect;
                    cachedReadMs = read;
                    log.info("AI RestTemplate 已重建：connect={}ms read={}ms", connect, read);
                }
                local = cachedTemplate;
            }
        }
        return local;
    }

    private String abbreviate(String raw) {
        String flat = raw.replaceAll("\\s+", " ").trim();
        return flat.length() <= RAW_RESPONSE_MAX ? flat : flat.substring(0, RAW_RESPONSE_MAX) + "…";
    }
}
