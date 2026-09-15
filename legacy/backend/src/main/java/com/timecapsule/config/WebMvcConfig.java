package com.timecapsule.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Web MVC 扩展：把上传目录映射为静态资源。
 * <p>
 * 映射后前端就能直接用 {@code <img src="/uploads/avatars/xxx.png">} 访问用户上传的图片。
 * 前端 dev server 那边需要把 {@code /uploads} 也加进 Vite 代理，否则会被当成前端路由而 404。
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final UploadProperties uploadProperties;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path root = uploadProperties.rootPath();
        Path avatarDir = uploadProperties.avatarPath();
        try {
            // 两个目录都提前建好：静态资源映射指向一个不存在的目录会报错，
            // 而且先建好之后，第一次上传失败也不会留下"半个"目录结构
            Files.createDirectories(root);
            Files.createDirectories(avatarDir);
        } catch (IOException e) {
            throw new IllegalStateException("无法创建上传目录：" + root, e);
        }

        String location = root.toUri().toString();
        if (!location.endsWith("/")) {
            location = location + "/";
        }

        registry.addResourceHandler(uploadProperties.getUrlPrefix() + "/**")
                .addResourceLocations(location)
                .setCachePeriod(3600);

        log.info("上传目录已映射：{} -> {}", uploadProperties.getUrlPrefix() + "/**", location);
    }
}
