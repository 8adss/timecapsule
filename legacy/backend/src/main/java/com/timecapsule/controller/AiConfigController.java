package com.timecapsule.controller;

import com.timecapsule.common.Result;
import com.timecapsule.dto.AiConfigRequest;
import com.timecapsule.dto.AiConfigView;
import com.timecapsule.service.AiConfigService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * AI 模型配置接口。
 * <p>
 * 安全约定：查询接口返回的 api_key 一律是掩码（如 {@code sk-976****08e5}），
 * 明文永远不会出后端；保存时 key 传空表示"不改动已有 key"。
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiConfigController {

    private final AiConfigService aiConfigService;

    /** 当前生效的 AI 配置（key 已脱敏） */
    @GetMapping("/config")
    public Result<AiConfigView> config() {
        return Result.ok(aiConfigService.view());
    }

    /** 保存配置 */
    @PutMapping("/config")
    public Result<AiConfigView> save(@Valid @RequestBody AiConfigRequest request) {
        return Result.ok(aiConfigService.save(request));
    }

    /**
     * 测试连通性：用请求里填的值（未填处回落当前配置）真实调用一次大模型。
     * <p>
     * 这里故意不加 @Valid：测试时用户可能只想改 key，
     * base_url / model 留空由服务端回落成当前值即可。
     */
    @PostMapping("/config/test")
    public Result<String> test(@RequestBody AiConfigRequest request) {
        return Result.ok(aiConfigService.test(request));
    }

    /** 拉取当前端点支持的模型列表，供前端下拉选择 */
    @GetMapping("/models")
    public Result<List<String>> models() {
        return Result.ok(aiConfigService.listModels());
    }
}
