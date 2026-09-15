package com.timecapsule.service;

import com.timecapsule.common.BusinessException;
import com.timecapsule.config.UploadProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/**
 * 本地文件存储。
 * <p>
 * 只做「存到磁盘 + 返回可访问的 URL」这一件事。之所以不把图片存进数据库：
 * 一张手机照片转 base64 后体积膨胀约 1/3，而且会塞满行记录、拖慢所有查询。
 * 存磁盘 + 静态资源映射是更常规的做法；规模再大就换成对象存储（OSS）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileStorageService {

    private final UploadProperties properties;

    /**
     * 保存一张头像。
     *
     * @return 可直接给前端用的 URL，例如 {@code /uploads/avatars/u1-3f9c2a8b1d4e.png}
     */
    public String storeAvatar(Long userId, MultipartFile file) {
        validate(file);

        String extension = extensionOf(file.getContentType());
        String filename = "u" + userId + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12) + extension;

        Path dir = properties.avatarPath();
        Path target = dir.resolve(filename).normalize();
        // 虽然文件名是我们自己生成的，仍然校验一次，杜绝路径穿越
        if (!target.startsWith(dir)) {
            throw new BusinessException("非法的文件名");
        }

        try {
            Files.createDirectories(dir);
            file.transferTo(target.toFile());
        } catch (IOException e) {
            log.error("保存头像失败", e);
            throw new BusinessException("保存头像失败，请重试");
        }

        String url = properties.getUrlPrefix() + "/" + properties.getAvatarSubDir() + "/" + filename;
        log.info("用户 {} 上传头像 -> {}", userId, url);
        return url;
    }

    /**
     * 删除本服务自己存的图片。
     * 只处理以本站前缀开头的地址；用户之前用的是外链（比如种子数据里的 dicebear）就跳过，不去删别人的东西。
     */
    public void deleteIfLocal(String url) {
        if (!StringUtils.hasText(url)) {
            return;
        }
        String prefix = properties.getUrlPrefix() + "/";
        if (!url.startsWith(prefix)) {
            return;
        }

        Path root = properties.rootPath();
        Path target = root.resolve(url.substring(prefix.length())).normalize();
        if (!target.startsWith(root)) {
            return;
        }

        try {
            if (Files.deleteIfExists(target)) {
                log.info("已删除旧头像文件 {}", target.getFileName());
            }
        } catch (IOException e) {
            // 删不掉不是致命问题，留个日志就行
            log.warn("删除旧头像失败 {}：{}", target, e.getMessage());
        }
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("请选择要上传的图片");
        }
        if (file.getSize() > properties.maxAvatarSizeBytes()) {
            throw new BusinessException("图片不能超过 " + properties.getMaxAvatarSizeKb() / 1024 + " MB");
        }
        String contentType = file.getContentType();
        if (contentType == null || !properties.getAllowedContentTypes().contains(contentType.toLowerCase())) {
            throw new BusinessException("只支持 JPG / PNG / WebP / GIF 格式的图片");
        }
    }

    /** 扩展名由 MIME 类型推导，不用客户端传的文件名 */
    private String extensionOf(String contentType) {
        return switch (contentType.toLowerCase()) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            default -> ".img";
        };
    }
}
