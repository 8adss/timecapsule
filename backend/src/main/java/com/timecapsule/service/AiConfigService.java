package com.timecapsule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.timecapsule.ai.AiHttpClient;
import com.timecapsule.ai.AiProperties;
import com.timecapsule.ai.AiRuntimeConfig;
import com.timecapsule.common.BusinessException;
import com.timecapsule.dto.AiConfigRequest;
import com.timecapsule.dto.AiConfigView;
import com.timecapsule.entity.AiConfig;
import com.timecapsule.mapper.AiConfigMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

/**
 * AI 模型配置服务。
 * <p>
 * 生效优先级：数据库 ai_config 表的<b>非空字段</b> &gt; application.yml / application-local.yml。
 * 逐字段回落而不是整份覆盖，好处是：
 * <ul>
 *   <li>真实 API Key 可以只放在本地的 application-local.yml 里，SQL 脚本和数据库里都不留明文</li>
 *   <li>用户在前端只想换模型时，不用把 key 再填一遍</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiConfigService {

    private static final String DEFAULT_PROVIDER = "自定义";

    private final AiConfigMapper aiConfigMapper;
    private final AiProperties defaults;
    private final AiHttpClient httpClient;

    /** 当前生效的配置快照 */
    public AiRuntimeConfig effective() {
        AiConfig row = currentRow();
        return new AiRuntimeConfig(
                firstNonBlank(row == null ? null : row.getProvider(), DEFAULT_PROVIDER),
                firstNonBlank(row == null ? null : row.getBaseUrl(), defaults.getBaseUrl()),
                firstNonBlank(row == null ? null : row.getApiKey(), defaults.getApiKey()),
                firstNonBlank(row == null ? null : row.getModel(), defaults.getModel()),
                row != null && row.getTemperature() != null
                        ? row.getTemperature().doubleValue() : defaults.getTemperature(),
                defaults.getConnectTimeoutMs(),
                defaults.getReadTimeoutMs(),
                defaults.getHistoryLimit(),
                defaults.getKnowledgeLimit());
    }

    /** 给前端看的配置（key 已脱敏） */
    public AiConfigView view() {
        AiConfig row = currentRow();
        AiRuntimeConfig config = effective();
        return new AiConfigView(
                config.provider(),
                config.baseUrl(),
                mask(config.apiKey()),
                config.model(),
                config.temperature(),
                config.isConfigured(),
                row != null && StringUtils.hasText(row.getApiKey()),
                StringUtils.hasText(defaults.getApiKey()));
    }

    /**
     * 保存配置。
     * <p>
     * {@code apiKey} 传空表示"不改动已有的 key"——前端回显的是掩码，
     * 用户只是改模型时不应该把 {@code sk-976***08e5} 这种掩码当成新 key 存进来。
     */
    @Transactional(rollbackFor = Exception.class)
    public AiConfigView save(AiConfigRequest request) {
        AiConfig row = currentRow();
        boolean insert = row == null;
        if (insert) {
            row = new AiConfig();
        }

        row.setProvider(StringUtils.hasText(request.getProvider())
                ? request.getProvider().trim() : DEFAULT_PROVIDER);
        row.setBaseUrl(request.getBaseUrl().trim());
        row.setModel(request.getModel().trim());
        double temperature = request.getTemperature() == null ? 0.7 : request.getTemperature();
        row.setTemperature(BigDecimal.valueOf(temperature).setScale(2, RoundingMode.HALF_UP));
        if (StringUtils.hasText(request.getApiKey())) {
            row.setApiKey(request.getApiKey().trim());
        }

        if (insert) {
            aiConfigMapper.insert(row);
        } else {
            aiConfigMapper.updateById(row);
        }
        log.info("AI 配置已保存：{} / {} / {}", row.getProvider(), row.getModel(), row.getBaseUrl());
        return view();
    }

    /**
     * 用「请求里填的值 + 未填处回落当前生效值」拼一份临时配置，发一次真实请求做连通性测试。
     * 不会改动数据库。
     *
     * @return 可读的测试结果描述
     */
    public String test(AiConfigRequest request) {
        AiRuntimeConfig current = effective();
        AiRuntimeConfig probe = new AiRuntimeConfig(
                firstNonBlank(request.getProvider(), current.provider()),
                firstNonBlank(request.getBaseUrl(), current.baseUrl()),
                firstNonBlank(request.getApiKey(), current.apiKey()),
                firstNonBlank(request.getModel(), current.model()),
                request.getTemperature() == null ? current.temperature() : request.getTemperature(),
                current.connectTimeoutMs(),
                current.readTimeoutMs(),
                current.historyLimit(),
                current.knowledgeLimit());

        long started = System.currentTimeMillis();
        String reply = httpClient.chat(probe, List.of(
                Map.of("role", "user", "content", "请只回复两个字：可用")));
        long cost = System.currentTimeMillis() - started;
        return "连接成功（" + cost + " ms，模型 " + probe.model() + "）：" + reply;
    }

    /** 拉取该端点支持的模型列表，供前端下拉选择 */
    public List<String> listModels() {
        return httpClient.listModels(effective());
    }

    /** 掩码：sk-EXAMPLE0000000000000000000000 → sk-EXAM****0000 */
    public static String mask(String key) {
        if (!StringUtils.hasText(key)) {
            return "";
        }
        String trimmed = key.trim();
        if (trimmed.length() <= 12) {
            return "****";
        }
        return trimmed.substring(0, 6) + "****" + trimmed.substring(trimmed.length() - 4);
    }

    /** 该表逻辑上只有一行，取 id 最小的那条，避免依赖固定主键值 */
    private AiConfig currentRow() {
        return aiConfigMapper.selectOne(new LambdaQueryWrapper<AiConfig>()
                .orderByAsc(AiConfig::getId)
                .last("LIMIT 1"));
    }

    private String firstNonBlank(String preferred, String fallback) {
        if (StringUtils.hasText(preferred)) {
            return preferred.trim();
        }
        return fallback == null ? "" : fallback.trim();
    }
}
