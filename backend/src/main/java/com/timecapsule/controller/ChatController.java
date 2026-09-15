package com.timecapsule.controller;

import com.timecapsule.common.Result;
import com.timecapsule.dto.ChatRequest;
import com.timecapsule.dto.PersonaChatRequest;
import com.timecapsule.entity.Dialogue;
import com.timecapsule.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * AI 对话接口，两种对话对象：
 * <ul>
 *   <li>{@code /past-self} —— 与「过去的你」对话，人设来自一枚时间胶囊</li>
 *   <li>{@code /persona}   —— 与「何时的自己」对话，人设来自知识库蒸馏出的分身</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    /** 与"过去的你"对话 */
    @PostMapping("/past-self")
    public Result<Dialogue> chat(@Valid @RequestBody ChatRequest request) {
        return Result.ok(chatService.chatWithPastSelf(
                request.getUserId(), request.getCapsuleId(), request.getMessage()));
    }

    /** 某胶囊下的完整对话历史 */
    @GetMapping("/history")
    public Result<List<Dialogue>> history(@RequestParam Long userId, @RequestParam Long capsuleId) {
        return Result.ok(chatService.history(userId, capsuleId));
    }

    /** 与"何时的自己"对话 */
    @PostMapping("/persona")
    public Result<Dialogue> chatWithPersona(@Valid @RequestBody PersonaChatRequest request) {
        return Result.ok(chatService.chatWithPersona(
                request.getUserId(), request.getPersonaId(), request.getMessage()));
    }

    /** 某分身下的完整对话历史 */
    @GetMapping("/persona-history")
    public Result<List<Dialogue>> personaHistory(@RequestParam Long userId,
                                                 @RequestParam Long personaId) {
        return Result.ok(chatService.personaHistory(userId, personaId));
    }
}
