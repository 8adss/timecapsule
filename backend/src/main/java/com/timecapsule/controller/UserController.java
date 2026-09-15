package com.timecapsule.controller;

import com.timecapsule.common.BusinessException;
import com.timecapsule.common.Result;
import com.timecapsule.dto.UserUpdateRequest;
import com.timecapsule.entity.User;
import com.timecapsule.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Objects;

/**
 * 用户接口
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** 本地测试入口：传任意 openid 即可注册/登录 */
    @GetMapping("/login")
    public Result<User> login(@RequestParam String openid) {
        return Result.ok(userService.findOrCreateByOpenid(openid));
    }

    @GetMapping("/{id}")
    public Result<User> get(@PathVariable Long id) {
        return Result.ok(userService.getById(id));
    }

    /** 修改昵称 / 头像地址 */
    @PutMapping("/{id}")
    public Result<User> update(@PathVariable Long id, @Valid @RequestBody UserUpdateRequest request) {
        if (!Objects.equals(id, request.getUserId())) {
            throw new BusinessException(403, "只能修改自己的资料");
        }
        return Result.ok(userService.updateProfile(id, request.getNickname(), request.getAvatarUrl()));
    }

    /**
     * 上传头像（multipart/form-data，文件字段名固定为 {@code file}）。
     * <p>
     * 只接受图片类型、单张不超过 5MB，扩展名由服务端根据 MIME 推断，
     * 存盘文件名用 UUID 重新生成，不使用客户端传来的文件名。
     */
    @PostMapping("/{id}/avatar")
    public Result<User> uploadAvatar(@PathVariable Long id,
                                     @RequestParam Long userId,
                                     @RequestParam("file") MultipartFile file) {
        if (!Objects.equals(id, userId)) {
            throw new BusinessException(403, "只能修改自己的头像");
        }
        return Result.ok(userService.updateAvatar(id, file));
    }
}
