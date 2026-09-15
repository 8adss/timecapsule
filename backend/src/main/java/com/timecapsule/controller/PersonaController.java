package com.timecapsule.controller;

import com.timecapsule.common.Result;
import com.timecapsule.dto.PersonaCreateRequest;
import com.timecapsule.dto.PersonaDetail;
import com.timecapsule.entity.Persona;
import com.timecapsule.service.PersonaService;
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
 * 「自己的分身」接口：把知识库蒸馏成某个时间点的自己，之后可以和它对话。
 * <p>
 * 生成是异步的：POST 返回时 status 为 GENERATING，前端轮询详情接口，
 * 变成 READY 就可以对话，变成 FAILED 则展示 failReason。
 */
@RestController
@RequestMapping("/api/personas")
@RequiredArgsConstructor
public class PersonaController {

    private final PersonaService personaService;

    @GetMapping
    public Result<List<Persona>> list(@RequestParam Long userId) {
        return Result.ok(personaService.listByUser(userId));
    }

    /** 详情：画像 + 引用的文档；前端也用它轮询生成状态 */
    @GetMapping("/{id}")
    public Result<PersonaDetail> detail(@PathVariable Long id, @RequestParam Long userId) {
        Persona persona = personaService.getOwned(id, userId);
        return Result.ok(new PersonaDetail(persona, personaService.docsOf(id)));
    }

    /** 创建分身（选文档 + 命名 + 指定时间点），随后后台异步生成画像 */
    @PostMapping
    public Result<Persona> create(@Valid @RequestBody PersonaCreateRequest request) {
        return Result.ok(personaService.create(request));
    }

    /** 用同样的材料重新生成一次 */
    @PostMapping("/{id}/regenerate")
    public Result<Persona> regenerate(@PathVariable Long id, @RequestParam Long userId) {
        return Result.ok(personaService.regenerate(id, userId));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id, @RequestParam Long userId) {
        personaService.delete(id, userId);
        return Result.ok();
    }
}
