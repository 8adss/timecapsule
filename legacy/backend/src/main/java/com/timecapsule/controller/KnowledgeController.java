package com.timecapsule.controller;

import com.timecapsule.common.Result;
import com.timecapsule.dto.KnowledgeDocRequest;
import com.timecapsule.dto.KnowledgeDocView;
import com.timecapsule.entity.KnowledgeDoc;
import com.timecapsule.service.KnowledgeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 知识库接口：导入 / 查看 / 删除个人资料，作为生成「自己的分身」的原料
 */
@RestController
@RequestMapping("/api/knowledge")
@RequiredArgsConstructor
public class KnowledgeController {

    private final KnowledgeService knowledgeService;

    /** 文档列表（不带全文，只有预览） */
    @GetMapping
    public Result<List<KnowledgeDocView>> list(@RequestParam Long userId) {
        return Result.ok(knowledgeService.listByUser(userId));
    }

    /** 文档详情（含全文） */
    @GetMapping("/{id}")
    public Result<KnowledgeDoc> detail(@PathVariable Long id, @RequestParam Long userId) {
        return Result.ok(knowledgeService.getOwned(id, userId));
    }

    /** 导入一篇文档（前端把上传的 txt/md 读成文本后也走这个接口） */
    @PostMapping
    public Result<KnowledgeDocView> create(@Valid @RequestBody KnowledgeDocRequest request) {
        return Result.ok(knowledgeService.create(request));
    }

    /** 删除文档（逻辑删除） */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id, @RequestParam Long userId) {
        knowledgeService.delete(id, userId);
        return Result.ok();
    }
}
