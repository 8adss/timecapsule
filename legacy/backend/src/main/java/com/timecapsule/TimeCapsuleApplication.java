package com.timecapsule;

import lombok.extern.slf4j.Slf4j;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 跨时间自我对话式自律记事本 - 启动类
 */
@Slf4j
@SpringBootApplication
@MapperScan("com.timecapsule.mapper")
@EnableScheduling
public class TimeCapsuleApplication {

    public static void main(String[] args) {
        ConfigurableApplicationContext context = SpringApplication.run(TimeCapsuleApplication.class, args);
        // 端口从配置里读，改 application.yml 后日志不会说谎
        String port = context.getEnvironment().getProperty("server.port", "4114");
        log.info("TimeCapsule 启动成功，接口地址 http://localhost:{}/api/...", port);
        log.info("前端页面地址 http://localhost:4113（Vite dev server 会把 /api 代理到本服务）");
    }
}
