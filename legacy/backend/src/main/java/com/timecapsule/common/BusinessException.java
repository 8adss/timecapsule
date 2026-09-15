package com.timecapsule.common;

import lombok.Getter;

/**
 * 业务异常：由 {@link GlobalExceptionHandler} 统一转成 Result 返回，
 * 不会让前端收到 Spring 默认的错误结构。
 */
@Getter
public class BusinessException extends RuntimeException {

    /** 业务状态码，默认 400 */
    private final int code;

    public BusinessException(String message) {
        this(400, message);
    }

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }
}
