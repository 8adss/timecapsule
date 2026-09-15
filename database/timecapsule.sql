-- ============================================================
-- 跨时间自我对话式自律记事本（TimeCapsule）· 数据库初始化脚本
-- 数据库：MySQL 8.x        管理工具：Navicat
--
-- 【用法（Navicat）】
--   1. 打开 Navicat，连接你的 MySQL
--   2. 右键连接 →「运行 SQL 文件」→ 选择本文件 → 开始
--      （或：新建查询 → 把本文件内容全部粘贴进去 → 运行）
--   3. 执行完成后会出现 timecapsule 数据库、9 张表，以及一批虚拟数据
--
-- 【说明】
--   * 脚本可重复执行：先 DROP TABLE 再 CREATE，不会残留脏数据
--   * 虚拟数据的时间全部基于 NOW() 相对计算，任何时候导入都是"活的"：
--     已开启的胶囊永远在过去，未开启的永远在未来
--   * 前端默认登录账号：openid = test-openid-001（昵称「小林」，有完整数据）
--     另外还准备了 test-openid-002（阿May）、test-openid-003（老王）
--   * 本脚本不含 CREATE USER / 授权语句，使用你 Navicat 里现有的连接账号即可
-- ============================================================

CREATE DATABASE IF NOT EXISTS `timecapsule`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `timecapsule`;

-- 先删子表再删主表，避免引用顺序问题
DROP TABLE IF EXISTS `dialogues`;
DROP TABLE IF EXISTS `achievements`;
DROP TABLE IF EXISTS `time_capsules`;
DROP TABLE IF EXISTS `tasks`;
DROP TABLE IF EXISTS `users`;
-- v2 新增：AI 模型配置 / 知识库 / 自我的分身
DROP TABLE IF EXISTS `persona_docs`;
DROP TABLE IF EXISTS `personas`;
DROP TABLE IF EXISTS `knowledge_docs`;
DROP TABLE IF EXISTS `ai_config`;


-- ------------------------------------------------------------
-- 1. 用户表
-- ------------------------------------------------------------
CREATE TABLE `users` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `openid`       VARCHAR(64)  NOT NULL                COMMENT '微信openid（本地测试可自定义）',
  `nickname`     VARCHAR(50)           DEFAULT NULL   COMMENT '昵称',
  `avatar_url`   VARCHAR(255)          DEFAULT NULL   COMMENT '头像地址',
  `streak_days`  INT          NOT NULL DEFAULT 0      COMMENT '连续打卡天数（由完成任务自动计算）',
  `growth_level` INT          NOT NULL DEFAULT 1      COMMENT '成长等级（由完成任务数自动计算）',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '用户表';


-- ------------------------------------------------------------
-- 2. 任务表
-- ------------------------------------------------------------
CREATE TABLE `tasks` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '任务ID',
  `user_id`      BIGINT       NOT NULL                COMMENT '所属用户',
  `title`        VARCHAR(100) NOT NULL                COMMENT '任务名称',
  `category`     VARCHAR(20)           DEFAULT '习惯' COMMENT '类别：学习/健身/工作/习惯',
  `description`  VARCHAR(500)          DEFAULT NULL   COMMENT '任务描述',
  `start_date`   DATETIME              DEFAULT NULL   COMMENT '开始时间',
  `due_date`     DATETIME              DEFAULT NULL   COMMENT '截止时间',
  `remind_time`  DATETIME              DEFAULT NULL   COMMENT '提醒时间',
  `status`       TINYINT      NOT NULL DEFAULT 0      COMMENT '0进行中 1已完成 2已逾期 3已放弃',
  `completed_at` DATETIME              DEFAULT NULL   COMMENT '完成时间',
  `deleted`      TINYINT      NOT NULL DEFAULT 0      COMMENT '逻辑删除：0正常 1已删除',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  -- 列表查询：WHERE user_id=? AND deleted=0 ORDER BY created_at DESC
  KEY `idx_user_deleted_created` (`user_id`, `deleted`, `created_at`),
  -- 统计查询：WHERE user_id=? AND status=?
  KEY `idx_user_status` (`user_id`, `status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '任务表';


-- ------------------------------------------------------------
-- 3. 时间胶囊表（创建任务时写给未来自己的话）
-- ------------------------------------------------------------
CREATE TABLE `time_capsules` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '胶囊ID',
  `user_id`    BIGINT       NOT NULL                COMMENT '所属用户',
  `task_id`    BIGINT                DEFAULT NULL   COMMENT '关联任务，可为空（独立胶囊）',
  `to_date`    DATETIME     NOT NULL                COMMENT '未来开启时间',
  `content`    TEXT         NOT NULL                COMMENT '写给未来的话',
  `voice_url`  VARCHAR(255)          DEFAULT NULL   COMMENT '语音留言（可选，暂未实现）',
  `status`     TINYINT      NOT NULL DEFAULT 0      COMMENT '0未开启 1已开启',
  `opened_at`  DATETIME              DEFAULT NULL   COMMENT '开启时间',
  `deleted`    TINYINT      NOT NULL DEFAULT 0      COMMENT '逻辑删除：0正常 1已删除',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '封存时间',
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  -- 胶囊列表：WHERE user_id=? AND deleted=0 ORDER BY to_date DESC
  KEY `idx_user_deleted_to_date` (`user_id`, `deleted`, `to_date`),
  -- 定时任务扫描：WHERE status=0 AND deleted=0 AND to_date <= NOW()
  KEY `idx_status_deleted_to_date` (`status`, `deleted`, `to_date`),
  KEY `idx_task` (`task_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '时间胶囊表';


-- ------------------------------------------------------------
-- 4. 对话记录表（用户与"过去的你"的多轮对话）
-- ------------------------------------------------------------
CREATE TABLE `dialogues` (
  `id`          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '对话ID',
  `user_id`     BIGINT      NOT NULL                COMMENT '所属用户',
  `capsule_id`  BIGINT               DEFAULT NULL   COMMENT '关联胶囊（与「过去的你」对话时使用）',
  `persona_id`  BIGINT               DEFAULT NULL   COMMENT '关联分身（与「何时的自己」对话时使用）',
  `role`        VARCHAR(20) NOT NULL                COMMENT 'user / ai_past_self / ai_persona',
  `content`     TEXT        NOT NULL                COMMENT '对话内容',
  `emotion_tag` VARCHAR(20)          DEFAULT NULL   COMMENT '情绪标签：挫败/犹豫/孤独/喜悦/平静',
  `created_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '对话时间',
  PRIMARY KEY (`id`),
  -- 历史查询：WHERE capsule_id=? AND user_id=? ORDER BY created_at ASC
  KEY `idx_capsule_user_created` (`capsule_id`, `user_id`, `created_at`),
  -- 分身对话历史：WHERE persona_id=? AND user_id=? ORDER BY created_at ASC
  KEY `idx_persona_user_created` (`persona_id`, `user_id`, `created_at`),
  KEY `idx_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '对话记录表';


-- ------------------------------------------------------------
-- 5. 成就表
-- ------------------------------------------------------------
CREATE TABLE `achievements` (
  `id`          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '成就ID',
  `user_id`     BIGINT      NOT NULL                COMMENT '所属用户',
  `type`        VARCHAR(30) NOT NULL                COMMENT '类型：任务完成/胶囊开启/连续打卡',
  `value`       INT         NOT NULL DEFAULT 0      COMMENT '达成数值',
  `unlocked_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '解锁时间',
  PRIMARY KEY (`id`),
  -- 唯一索引保证"同类型同数值只发放一次"，并发下也不会重复发放
  UNIQUE KEY `uk_user_type_value` (`user_id`, `type`, `value`),
  KEY `idx_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '成就表';


-- ------------------------------------------------------------
-- 6. AI 模型配置表（v2 新增）
--    单行表：id 固定为 1。字段留空表示"回落到 application.yml / application-local.yml"，
--    所以真实的 API Key 可以只放在本地配置文件里，不进这张表、也不进 SQL 脚本。
-- ------------------------------------------------------------
CREATE TABLE `ai_config` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '固定为 1',
  `provider`       VARCHAR(50)  NOT NULL DEFAULT '自定义' COMMENT '供应商名称，仅用于展示',
  `base_url`       VARCHAR(255) NOT NULL                COMMENT 'OpenAI 兼容端点完整地址',
  `api_key`        VARCHAR(255)          DEFAULT NULL   COMMENT '为空则回落到配置文件里的 key',
  `model`          VARCHAR(100) NOT NULL                COMMENT '模型名，如 deepseek-v4-pro',
  `temperature`    DECIMAL(3,2) NOT NULL DEFAULT 0.70   COMMENT '采样温度 0~2',
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'AI 模型配置';


-- ------------------------------------------------------------
-- 7. 知识库文档表（v2 新增）
--    用户导入的个人资料，是生成「自己的分身」的原料
-- ------------------------------------------------------------
CREATE TABLE `knowledge_docs` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '文档ID',
  `user_id`     BIGINT       NOT NULL                COMMENT '所属用户',
  `title`       VARCHAR(200) NOT NULL                COMMENT '文档标题',
  `content`     MEDIUMTEXT   NOT NULL                COMMENT '正文（纯文本）',
  `source_type` VARCHAR(20)  NOT NULL DEFAULT 'PASTE' COMMENT 'PASTE=粘贴 / FILE=上传文件',
  `char_count`  INT          NOT NULL DEFAULT 0      COMMENT '正文字数',
  `deleted`     TINYINT      NOT NULL DEFAULT 0      COMMENT '逻辑删除：0正常 1已删除',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '导入时间',
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_deleted_created` (`user_id`, `deleted`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '知识库文档';


-- ------------------------------------------------------------
-- 8. 自我分身表（v2 新增）
--    「何时的自己」：把知识库蒸馏成某个时间点的人格画像
-- ------------------------------------------------------------
CREATE TABLE `personas` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '分身ID',
  `user_id`      BIGINT       NOT NULL                COMMENT '所属用户',
  `name`         VARCHAR(100) NOT NULL                COMMENT '分身名称，如「2026 年 9 月的我」',
  `self_date`    DATE         NOT NULL                COMMENT '代表哪个时间点的自己',
  `summary`      TEXT                                 COMMENT '画像：性格/在意的事/正在经历的阶段',
  `style_prompt` TEXT                                 COMMENT '说话风格：语气、常用表达、口头禅',
  `status`       VARCHAR(20)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/GENERATING/READY/FAILED',
  `fail_reason`  VARCHAR(500)          DEFAULT NULL   COMMENT '生成失败原因',
  `doc_count`    INT          NOT NULL DEFAULT 0      COMMENT '参与生成的知识库文档数',
  `model`        VARCHAR(100)          DEFAULT NULL   COMMENT '生成时使用的模型',
  `deleted`      TINYINT      NOT NULL DEFAULT 0      COMMENT '逻辑删除：0正常 1已删除',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_deleted_self_date` (`user_id`, `deleted`, `self_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '自我分身';


-- ------------------------------------------------------------
-- 9. 分身 ↔ 知识库文档 关联表（v2 新增）
-- ------------------------------------------------------------
CREATE TABLE `persona_docs` (
  `id`         BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `persona_id` BIGINT NOT NULL                COMMENT '分身ID',
  `doc_id`     BIGINT NOT NULL                COMMENT '知识库文档ID',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_persona_doc` (`persona_id`, `doc_id`),
  KEY `idx_doc` (`doc_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '分身与知识库文档关联';


-- ============================================================
-- 虚拟数据
-- 时间全部相对 NOW() 计算，保证导入后立刻可演示：
--   * 已开启的胶囊 to_date 在过去，未开启的在未来
--   * 连续打卡 / 等级 / 成就与任务完成记录保持一致
-- ============================================================

-- ---------- 用户 ----------
INSERT INTO `users`
  (`id`, `openid`, `nickname`, `avatar_url`, `streak_days`, `growth_level`, `created_at`, `updated_at`)
VALUES
  (1, 'test-openid-001', '小林',  'https://api.dicebear.com/7.x/thumbs/svg?seed=xiaolin', 4, 2, DATE_SUB(NOW(), INTERVAL 40 DAY), NOW()),
  (2, 'test-openid-002', '阿May', 'https://api.dicebear.com/7.x/thumbs/svg?seed=may',     2, 1, DATE_SUB(NOW(), INTERVAL 20 DAY), NOW()),
  (3, 'test-openid-003', '老王',  'https://api.dicebear.com/7.x/thumbs/svg?seed=laowang',  0, 1, DATE_SUB(NOW(), INTERVAL 5 DAY),  NOW());


-- ---------- 任务 ----------
-- 小林（用户1）：5 个任务，覆盖 进行中 / 已完成 / 已放弃
INSERT INTO `tasks`
  (`id`, `user_id`, `title`, `category`, `description`, `start_date`, `due_date`, `remind_time`,
   `status`, `completed_at`, `deleted`, `created_at`, `updated_at`)
VALUES
  (1, 1, '每天背 30 个英语单词', '学习', '用不背单词 App，早上通勤时完成',
      DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY),
      1, DATE_SUB(NOW(), INTERVAL 2 DAY), 0, DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),

  (2, 1, '每周跑步 3 次', '健身', '每次 5 公里以上，配速 6 分半以内',
      DATE_SUB(NOW(), INTERVAL 21 DAY), DATE_ADD(NOW(), INTERVAL 9 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY),
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 21 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY)),

  (3, 1, '写完毕业设计开题报告', '工作', '含国内外研究现状与技术路线，导师要求 8000 字',
      DATE_SUB(NOW(), INTERVAL 25 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), NULL,
      1, DATE_SUB(NOW(), INTERVAL 6 DAY), 0, DATE_SUB(NOW(), INTERVAL 25 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),

  (4, 1, '每天 23:30 前睡觉', '习惯', '睡前半小时不看手机',
      DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_ADD(NOW(), INTERVAL 16 DAY), DATE_ADD(CURDATE(), INTERVAL 23 HOUR) + INTERVAL 30 MINUTE,
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),

  (5, 1, '读完《被讨厌的勇气》', '学习', '每天 20 页，做读书笔记',
      DATE_SUB(NOW(), INTERVAL 35 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY), NULL,
      3, NULL, 0, DATE_SUB(NOW(), INTERVAL 35 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY)),

  -- 阿May（用户2）
  (6, 2, '每天喝够 8 杯水', '习惯', '用手机 App 打卡记录',
      DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_ADD(NOW(), INTERVAL 18 DAY), DATE_ADD(NOW(), INTERVAL 3 HOUR),
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),

  (7, 2, '拿下驾照科目二', '学习', '每周去练车 2 次',
      DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY), NULL,
      1, DATE_SUB(NOW(), INTERVAL 3 DAY), 0, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),

  -- 老王（用户3）
  (8, 3, '把阳台改造成小花园', '习惯', '先种薄荷和西红柿',
      DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_ADD(NOW(), INTERVAL 27 DAY), NULL,
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY));


-- ---------- 时间胶囊 ----------
-- 已开启（status=1）的胶囊 to_date 在过去；未开启（status=0）的在未来
INSERT INTO `time_capsules`
  (`id`, `user_id`, `task_id`, `to_date`, `content`, `status`, `opened_at`, `deleted`, `created_at`, `updated_at`)
VALUES
  (1, 1, 1, DATE_SUB(NOW(), INTERVAL 2 DAY),
      '嘿，30 天后的我。写下这段话的时候我正卡在单词书上，abandon 背了三遍还在第一页。我不知道你能不能坚持下来，但如果可以，希望你不要因为"只是背单词"就觉得它不值一提——我真的很想成为那个说起床就起床的人。',
      1, DATE_SUB(NOW(), INTERVAL 2 DAY), 0, DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),

  (2, 1, 3, DATE_SUB(NOW(), INTERVAL 6 DAY),
      '开题报告改到第四版了，导师说我的技术路线写得太虚。说实话有点想哭，但我还是想跟自己说：你不是不会写，你只是还没想清楚。别急，想清楚了再动笔。等你看到这段话的时候，应该已经交上去了吧。',
      1, DATE_SUB(NOW(), INTERVAL 6 DAY), 0, DATE_SUB(NOW(), INTERVAL 25 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),

  (3, 1, 2, DATE_ADD(NOW(), INTERVAL 9 DAY),
      '今天是跑步的第 3 天，腿酸得下楼都扶着扶手。我给自己定了个 21 天的小目标，不敢告诉别人，怕做不到丢人。如果 21 天后的你已经能轻松跑完 5 公里了，记得替现在的我高兴一下。',
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 21 DAY), DATE_SUB(NOW(), INTERVAL 21 DAY)),

  (4, 1, 4, DATE_ADD(NOW(), INTERVAL 16 DAY),
      '现在是凌晨 1 点 40 分，我又一次刷手机刷到了这个点。明天的我一定会很累，然后继续熬夜——这个循环我受够了。我想跟自己做个约定：这 30 天里，至少有一半的日子能在 23:30 前躺下。不求完美，只求别再原地打转。',
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY)),

  -- 独立胶囊：没有关联任务
  (5, 1, NULL, DATE_ADD(NOW(), INTERVAL 180 DAY),
      '写给半年后的自己：不知道你现在在哪里、在做什么。只希望你还保留着现在这点笨拙的认真——会为一件小事高兴很久，会因为没能坚持而难过，会因为一句鼓励的话重新坐回书桌前。',
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),

  -- 阿May
  (6, 2, 7, DATE_SUB(NOW(), INTERVAL 3 DAY),
      '今天第二次练车又把离合踩熄火了，教练叹了口气没说话。我坐在车里突然特别想放弃。可是报名费都交了，而且我真的很想自己开车去看海。所以，别放弃好吗？',
      1, DATE_SUB(NOW(), INTERVAL 3 DAY), 0, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),

  (7, 2, 6, DATE_ADD(NOW(), INTERVAL 18 DAY),
      '皮肤最近很差，医生说多喝水。这种事小到不值得写下来，但我想试试认真对待自己的身体。',
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 12 DAY)),

  -- 老王
  (8, 3, 8, DATE_ADD(NOW(), INTERVAL 27 DAY),
      '搬家之后一直没心思打理阳台，堆了一堆纸箱。想让那里长点绿色的东西，算是我给自己留的一点生活。',
      0, NULL, 0, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY));


-- ---------- 对话记录 ----------
-- 胶囊1（小林 · 背单词）下的完整多轮对话
INSERT INTO `dialogues` (`user_id`, `capsule_id`, `role`, `content`, `emotion_tag`, `created_at`) VALUES
  (1, 1, 'user',  '你还在吗？我今天背完了 30 个，但昨天漏了一天，感觉自己又搞砸了。', '挫败', DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 1 MINUTE),
  (1, 1, 'ai_past_self',
      '我在的。你可能不记得了，但写下那段话的我，abandon 背了三遍都没翻过第一页——我比你更清楚"又搞砸了"是什么感觉。\n\n漏掉一天确实可惜，可你昨天之前连着背了 12 天，那不是运气。要不要先别急着补昨天的，把今天的 30 个背完？明天再决定要不要补。',
      NULL, DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 2 MINUTE),
  (1, 1, 'user',  '嗯……你说得对。其实我不是背不下来，我是怕自己坚持不了太久。', '犹豫', DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 3 MINUTE),
  (1, 1, 'ai_past_self',
      '怕坚持不了，说明你已经在认真对待这件事了，这跟三天热度不是一回事。\n\n我不骗你说"你一定行"，因为我不知道。但我知道写那段话时的我，想要的是"成为一个说起床就起床的人"，而不是"一天都不许断的人"。少一天不会毁掉这个目标，彻底不背才会。',
      NULL, DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 4 MINUTE),
  (1, 1, 'user',  '好，我今天先背完。谢谢你。', '平静', DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 5 MINUTE),
  (1, 1, 'ai_past_self',
      '去吧。等你想说话的时候，我一直在这儿。',
      NULL, DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 6 MINUTE);

-- 胶囊2（小林 · 开题报告）下的对话
INSERT INTO `dialogues` (`user_id`, `capsule_id`, `role`, `content`, `emotion_tag`, `created_at`) VALUES
  (1, 2, 'user',  '交上去了。导师说这一版可以了。', '喜悦', DATE_SUB(NOW(), INTERVAL 6 DAY) + INTERVAL 1 MINUTE),
  (1, 2, 'ai_past_self',
      '太好了。我写那段话的时候正在改第四版，还偷偷想过"是不是我根本不适合做研究"。\n\n你现在看到的"交上去"三个字，是我当时最想要的东西。这个成绩是你一个人扛下来的，别轻描淡写地翻过去。',
      NULL, DATE_SUB(NOW(), INTERVAL 6 DAY) + INTERVAL 2 MINUTE);

-- 胶囊6（阿May · 科目二）下的对话
INSERT INTO `dialogues` (`user_id`, `capsule_id`, `role`, `content`, `emotion_tag`, `created_at`) VALUES
  (2, 6, 'user',  '我过了！！一次就过了！', '喜悦', DATE_SUB(NOW(), INTERVAL 3 DAY) + INTERVAL 1 MINUTE),
  (2, 6, 'ai_past_self',
      '我就知道你会坐在这里说这句话。练车熄火那天的我，其实已经在心里替你高兴过一遍了。\n\n现在，去报名科目三吧——顺便想想那片海。',
      NULL, DATE_SUB(NOW(), INTERVAL 3 DAY) + INTERVAL 2 MINUTE);


-- ---------- 成就 ----------
INSERT INTO `achievements` (`user_id`, `type`, `value`, `unlocked_at`) VALUES
  (1, '任务完成', 1, DATE_SUB(NOW(), INTERVAL 6 DAY)),
  (1, '任务完成', 3, DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (1, '胶囊开启', 1, DATE_SUB(NOW(), INTERVAL 6 DAY)),
  (1, '胶囊开启', 2, DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (1, '连续打卡', 3, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (2, '任务完成', 1, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (2, '胶囊开启', 1, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (2, '连续打卡', 2, DATE_SUB(NOW(), INTERVAL 1 DAY));


-- ============================================================
-- v2 新增模块的虚拟数据
-- ============================================================

-- ---------- AI 模型配置（单行，id 固定为 1）----------
-- api_key 故意留空：留空时会回落到 application-local.yml 里配置的 key，
-- 这样真实 key 不会被写进这个会被提交进仓库的 SQL 脚本。
-- 想换 key，在前端「设置 → AI 模型配置」页面里填即可，会存进这张表并优先生效。
INSERT INTO `ai_config` (`id`, `provider`, `base_url`, `api_key`, `model`, `temperature`) VALUES
  (1, 'DeepSeek', 'https://api.deepseek.com/chat/completions', '', 'deepseek-v4-pro', 0.70);


-- ---------- 知识库文档（小林 · 用户1）----------
INSERT INTO `knowledge_docs`
  (`id`, `user_id`, `title`, `content`, `source_type`, `char_count`, `deleted`, `created_at`, `updated_at`)
VALUES
  (1, 1, '关于我（2026 年版）',
      '我叫小林，24 岁，计算机专业研三，正在写毕业设计。\n'
      '性格偏内向，不太擅长在人群里说话，但一对一的时候可以聊很久。\n'
      '在意的事情：答应别人的事一定要做到；不喜欢欠人情；讨厌自己说话不算数。\n'
      '不太在意的事情：穿着、社交场合的排面、别人的进度。\n'
      '习惯：早上七点起，通勤路上背单词；睡前会写几句当天的心情。\n'
      '最近在焦虑的事：毕业设计能不能按时做完、毕业之后去哪个城市。\n'
      '我很清楚自己不是天赋型选手，属于慢慢磨的那种人。',
      'PASTE', 214, 0, DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY)),

  (2, 1, '日记摘录 · 最近三个月',
      '3 月 12 日：今天把开题报告交上去了，导师说可以用。走出教学楼的时候阳光很好，我在台阶上站了一会儿，突然有点想哭。\n'
      '4 月 2 日：跑步第 3 天，腿酸得下楼要扶扶手。我给自己定了 21 天的小目标，没敢告诉别人，怕做不到丢人。\n'
      '4 月 20 日：单词断了 5 天。本来想干脆放弃，后来还是捡起来了。发现真正难受的不是断掉那天，而是决定"算了"的那一刻。\n'
      '5 月 8 日：和室友聊到凌晨一点，说到毕业之后可能再也见不到。有点舍不得，但我更想出去看看。\n'
      '5 月 30 日：今天什么都没干成，刷了一天手机。睡前有点讨厌自己，但还是写下这句话：明天再说，别在这时候给自己判刑。',
      'FILE', 268, 0, DATE_SUB(NOW(), INTERVAL 15 DAY), DATE_SUB(NOW(), INTERVAL 15 DAY)),

  (3, 1, '我在坚持的事，以及为什么',
      '背单词：不是为了考试，是因为想有一天能直接看英文文档和论文，不想永远等别人翻译。\n'
      '跑步：一开始是为了减重，后来发现跑完之后那两个小时的平静才是我真正想要的。\n'
      '早睡：我想停止"熬夜—后悔—继续熬夜"这个循环。不求每天做到，只求一半以上的日子做到。\n'
      '读书：读完《被讨厌的勇气》之后，我第一次意识到"别人怎么看我"这件事，其实是我自己选的负担。\n'
      '我失败过很多次，也放弃过很多事。但我不想因为放弃过，就认为自己是个会放弃的人。',
      'PASTE', 224, 0, DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 12 DAY)),

  (4, 1, '专业方向与学习笔记',
      '方向：后端开发，主语言 Java。熟悉 Spring Boot、MyBatis-Plus、MySQL。\n'
      '在学：分布式基础（缓存、消息队列）、Vue 3 前端（够用就行）。\n'
      '做过的项目：一个跨时间自我对话式的自律记事本（就是现在这个），一个校园二手交易平台。\n'
      '写给自己的提醒：不要用"我还没准备好"当拖延的借口；能跑起来的东西比完美的设计更有价值。\n'
      '目标：毕业前把两个项目都放到线上跑起来，简历上能写出真实的技术难点。',
      'PASTE', 205, 0, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY));


-- ---------- 自我分身（小林 · 用户1）----------
-- status=READY 表示画像已经生成好，可以直接对话
INSERT INTO `personas`
  (`id`, `user_id`, `name`, `self_date`, `summary`, `style_prompt`, `status`, `fail_reason`,
   `doc_count`, `model`, `deleted`, `created_at`, `updated_at`)
VALUES
  (1, 1, '2026 年 9 月的我', CURDATE(),
      '研三在读，正在写毕业设计，同时准备秋招。表面平静，内心对"能不能按时毕业"和"去哪个城市"这两件事持续焦虑。'
      '性格内向但真诚，一对一能聊很久。核心信条是"答应的事要做到"，最受不了自己说话不算数。'
      '不属于天赋型选手，靠慢慢磨。反复经历过"放弃—不甘心—再捡起来"的循环，所以对断掉计划这件事有切身体会，'
      '不会用"你怎么又没坚持住"去责备别人。最近刚读完《被讨厌的勇气》，开始试着放下"别人怎么看我"的负担。',
      '说话温和、不煽情，习惯先承认对方的处境再给建议。常用"说实话""其实""我懂"开头。'
      '不喜欢讲大道理，更愿意讲自己当时的具体感受（比如腿酸得扶扶手、在台阶上站了一会儿）。'
      '被问到时会给建议，但一定会补一句"决定权在你"，不替对方做决定。回答控制在 150 字以内。',
      'READY', NULL, 4, 'deepseek-v4-pro', 0, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),

  (2, 1, '2025 年冬天的我', DATE_SUB(CURDATE(), INTERVAL 9 MONTH),
      '刚开题，什么都还没开始做，每天在"要不要换题"里反复横跳。那时候的我对未来的想象还很模糊，'
      '但有一股"这次一定要认真做完一件事"的劲头。比起现在，那时的我更乐观，也更沉不住气。',
      '语气比现在更跳脱、更爱开玩笑，经常用"哈哈""害""你说呢"。喜欢用短句，偶尔自嘲。'
      '不太会给建议，更多是陪着聊、一起吐槽。回答控制在 120 字以内。',
      'READY', NULL, 2, 'deepseek-v4-pro', 0, DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY));


-- ---------- 分身引用的知识库文档 ----------
INSERT INTO `persona_docs` (`persona_id`, `doc_id`) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4),
  (2, 1), (2, 2);


-- ---------- 与分身的历史对话（小林）----------
INSERT INTO `dialogues` (`user_id`, `persona_id`, `role`, `content`, `emotion_tag`, `created_at`) VALUES
  (1, 1, 'user',  '我最近总觉得自己在原地打转，什么都推进不下去。', '挫败', DATE_SUB(NOW(), INTERVAL 5 DAY) + INTERVAL 1 MINUTE),
  (1, 1, 'ai_persona',
      '说实话我懂这种感觉。上个月我也有过整整一周什么都没干成，睡前还挺讨厌自己的。\n\n后来我发现，真正卡住我的不是事情难，而是我一直在等一个"状态好的时候"再开始。你要不要先挑一件最小的事做掉？不用是重要的那件。',
      NULL, DATE_SUB(NOW(), INTERVAL 5 DAY) + INTERVAL 2 MINUTE),
  (1, 1, 'user',  '那我先改改论文的格式吧，这个简单。', '平静', DATE_SUB(NOW(), INTERVAL 5 DAY) + INTERVAL 3 MINUTE),
  (1, 1, 'ai_persona',
      '这个可以。格式改完你至少能看见一点变化，比一直盯着目录页焦虑强。\n\n改完要是觉得还有劲，再顺手看一眼技术路线那一节。没劲就算了，今天这样也够了。',
      NULL, DATE_SUB(NOW(), INTERVAL 5 DAY) + INTERVAL 4 MINUTE);


-- ============================================================
-- 自检查询（导入完成后可以直接跑这几条确认）
-- ============================================================
-- SELECT COUNT(*) AS 用户数 FROM users;                      -- 期望 3
-- SELECT COUNT(*) AS 任务数 FROM tasks;                      -- 期望 8
-- SELECT COUNT(*) AS 胶囊数 FROM time_capsules;              -- 期望 8
-- SELECT COUNT(*) AS 对话数 FROM dialogues;                  -- 期望 12
-- SELECT COUNT(*) AS 成就数 FROM achievements;               -- 期望 8
-- SELECT COUNT(*) AS 知识库 FROM knowledge_docs;             -- 期望 4
-- SELECT COUNT(*) AS 分身 FROM personas;                     -- 期望 2
-- SELECT id, provider, model, IF(api_key='','(留空→回落配置文件)','已配置') AS key状态 FROM ai_config;
-- SELECT id, openid, nickname, streak_days, growth_level FROM users;
