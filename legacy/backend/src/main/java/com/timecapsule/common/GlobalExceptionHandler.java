package com.timecapsule.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.util.StringUtils;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

/**
 * 全局异常处理：保证任何异常都按项目约定的
 * {@code { "code": ..., "message": "...", "data": null }} 结构返回。
 * <p>
 * 约定：HTTP 状态码统一 200，业务结果看 body 里的 code（前端拦截器按 code 判断）。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 业务异常：参数不合法、资源不存在、无权限等 */
    @ExceptionHandler(BusinessException.class)
    public Result<Void> handleBusiness(BusinessException e) {
        log.warn("业务异常 code={} message={}", e.getCode(), e.getMessage());
        return Result.error(e.getCode(), e.getMessage());
    }

    /** @Valid 校验失败 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(fieldError -> fieldError.getField() + " " + fieldError.getDefaultMessage())
                .collect(Collectors.joining("；"));
        return Result.error(400, StringUtils.hasText(message) ? message : "参数校验失败");
    }

    /** 缺少必填的 query 参数，或参数类型不对（例如 userId 传了空字符串） */
    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public Result<Void> handleBadParameter(Exception e) {
        log.warn("请求参数错误: {}", e.getMessage());
        return Result.error(400, "请求参数缺失或格式不正确，请检查后重试");
    }

    /** 请求体格式错误（最常见的是日期格式不对） */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public Result<Void> handleUnreadable(HttpMessageNotReadableException e) {
        log.warn("请求体解析失败: {}", e.getMessage());
        return Result.error(400, "请求体格式错误，日期请使用 yyyy-MM-dd HH:mm:ss 格式");
    }

    /** 请求方法不支持，例如对只有 GET 的接口发 POST */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public Result<Void> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        log.warn("请求方法不支持: {}", e.getMessage());
        return Result.error(405, "该接口不支持 " + e.getMethod() + " 请求");
    }

    /** 上传的图片超过大小上限 —— 给出可操作的提示，而不是笼统的 500 */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public Result<Void> handleUploadTooLarge(MaxUploadSizeExceededException e) {
        log.warn("上传文件过大: {}", e.getMessage());
        return Result.error(400, "图片太大了，请压缩到 5 MB 以内再上传");
    }

    /** 表单里缺少文件字段，例如 multipart 请求没有带 file */
    @ExceptionHandler(MissingServletRequestPartException.class)
    public Result<Void> handleMissingPart(MissingServletRequestPartException e) {
        log.warn("上传缺少文件字段: {}", e.getMessage());
        return Result.error(400, "请选择要上传的图片（表单字段名应为 file）");
    }

    /** 其余 multipart 解析问题：请求不是合法的 multipart 等 */
    @ExceptionHandler(MultipartException.class)
    public Result<Void> handleMultipart(MultipartException e) {
        log.warn("multipart 请求解析失败: {}", e.getMessage());
        return Result.error(400, "上传请求格式不正确，请重新选择图片后重试");
    }

    /** 访问了不存在的接口路径 */
    @ExceptionHandler(NoResourceFoundException.class)
    public Result<Void> handleNoResource(NoResourceFoundException e) {
        log.warn("接口不存在: {}", e.getResourcePath());
        return Result.error(404, "接口不存在：" + e.getResourcePath());
    }

    /** 兜底：未预料到的异常，记录完整堆栈但不把内部细节暴露给前端 */
    @ExceptionHandler(Exception.class)
    public Result<Void> handleOther(Exception e) {
        log.error("系统异常", e);
        return Result.error(500, "服务器内部错误，请查看后端日志");
    }
}
