package com.timecapsule.dto;

/**
 * 回给前端的 AI 配置视图。
 * <p>
 * 注意 {@code apiKey} 是掩码（如 {@code sk-976***08e5}），永远不返回明文。
 *
 * @param provider      供应商名称
 * @param baseUrl       端点地址
 * @param apiKey        掩码后的 key
 * @param model         模型名
 * @param temperature   采样温度
 * @param configured    当前是否已经能调用（key 非空）
 * @param keyFromDb      key 是否来自数据库
 * @param keyFromConfig  key 是否来自配置文件（application-local.yml）
 */
public record AiConfigView(
        String provider,
        String baseUrl,
        String apiKey,
        String model,
        double temperature,
        boolean configured,
        boolean keyFromDb,
        boolean keyFromConfig) {
}
