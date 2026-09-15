package com.timecapsule.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 跨域配置：只放行本机页面（任意本地端口）。
 * <p>
 * 允许的来源写在 application.yml 的 {@code app.cors.allowed-origin-patterns}，默认是
 * {@code http://localhost:*} 与 {@code http://127.0.0.1:*}。这样处理的原因：
 * <ul>
 *   <li>比写死端口耐改 —— 前端从 5173 换到 4113 时不用回来动这里</li>
 *   <li>仍然只放开「你自己机器上跑的页面」，公网站点依旧被挡在外面
 *       （初版用的是 {@code allowedOriginPatterns("*")}，那才是任意站点都能读接口）</li>
 * </ul>
 * 部署到云平台后，把实际域名加进这个配置即可。
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.cors.allowed-origin-patterns:http://localhost:*,http://127.0.0.1:*}")
    private String[] allowedOriginPatterns;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(allowedOriginPatterns)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
