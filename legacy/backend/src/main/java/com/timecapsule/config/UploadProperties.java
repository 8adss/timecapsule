package com.timecapsule.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Set;

/**
 * 文件上传相关配置（对应 application.yml 的 app.upload.*）
 */
@Data
@Component
@ConfigurationProperties(prefix = "app.upload")
public class UploadProperties {

    /** 上传文件根目录，相对后端工作目录 */
    private String dir = "./uploads";

    /** 对外访问前缀，会和静态资源映射绑定 */
    private String urlPrefix = "/uploads";

    /** 头像子目录 */
    private String avatarSubDir = "avatars";

    /** 单张头像大小上限（KB） */
    private long maxAvatarSizeKb = 5120;

    /**
     * 允许的图片类型。
     * <p>
     * 只认 MIME 类型、不认扩展名：扩展名由客户端随便写，
     * 用它来拼文件名会被构造出 {@code ../../evil.jsp} 这类路径穿越。
     */
    private Set<String> allowedContentTypes = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/gif");

    /** 根目录的绝对路径（解析成绝对路径，避免受运行时工作目录变化影响） */
    public Path rootPath() {
        return Paths.get(dir).toAbsolutePath().normalize();
    }

    /** 头像目录的绝对路径 */
    public Path avatarPath() {
        return rootPath().resolve(avatarSubDir).normalize();
    }

    public long maxAvatarSizeBytes() {
        return maxAvatarSizeKb * 1024;
    }
}
