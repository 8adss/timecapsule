# 跨时间自我对话式自律记事本（TimeCapsule）

一款让用户与"过去的自己"对话的自律记事工具：**创建任务时写给未来自己一段话（时间胶囊），任务完成后 AI 以"过去的你"为角色与用户对话**。产品融合行为心理学理论（未来自我连续性、自我决定理论）与 AI 技术，打造有温度、有思考的个人成长工具。

- 开发方式：IDEA（后端）+ VSCode（前端）
- 交付形态：先本地网页测试 → 后续部署云平台网址 / 适配微信小程序
- 数据库：MySQL（Navicat 导入）

## 一、功能清单

### 核心功能（均已可用）
| 功能 | 说明 | 状态 |
| --- | --- | --- |
| 任务管理 | 创建/编辑/删除/放弃任务，类别（学习/健身/工作/习惯），截止与提醒时间 | ✅ 已实现 |
| 完成任务 | 状态流转 + 记录完成时间，并联动连续打卡、成长等级、成就发放 | ✅ 已实现 |
| 任务逾期 | 定时任务把过了截止时间仍未完成的任务自动标记为「已逾期」 | ✅ 已实现 |
| 时间胶囊 | 创建任务时写给未来的话，或单独封存；指定未来开启时间 | ✅ 已实现 |
| 胶囊自动开启 | 定时任务每分钟扫描到期胶囊自动开启；也支持手动提前开启（带二次确认） | ✅ 已实现 |
| 与"过去的你"对话 | AI 以胶囊原文为人设，**注入最近 10 条历史，支持真正的多轮对话** | ✅ 已实现 |
| 对话历史 | 按胶囊查看完整对话记录，含情绪标签 | ✅ 已实现 |
| 成就徽章 | 任务完成/胶囊开启/连续打卡三类里程碑自动发放，唯一索引保证幂等 | ✅ 已实现 |
| 用户登录 | openid 查找或创建；浏览器本地持久化，刷新不掉登录态 | ✅ 已实现 |
| 个人资料 | 查看成长等级/连续打卡/完成数，修改昵称，切换测试账号 | ✅ 已实现 |
| **AI 模型配置** | 前端可选供应商预设、填 Key、**拉取该 Key 真实可用的模型列表**、一键测试连通性；配置存库且优先于配置文件 | ✅ v2 新增 |
| **知识库** | 导入个人资料（粘贴或上传 .txt/.md），列表带预览、可查看全文、可删除 | ✅ v2 新增 |
| **我的分身** | 用知识库**异步蒸馏**出「某个时间点的自己」，产出人物画像 + 说话风格 | ✅ v2 新增 |
| **与「何时的自己」对话** | 对话页可切换对话对象；分身对话会**按当前消息召回知识片段**作为"记忆" | ✅ v2 新增 |

### 待实现（后续迭代）
- [ ] 向量检索：知识库召回目前是关键词打分，数据量大后应换成 embedding + 向量库
- [ ] 分身的"自动成长"：按时间自动归档旧画像（如每月一号自动固化一次"这个月的我"）
- [ ] AI 记忆模块进阶：任务完成度、用户成长数据注入，超长上下文摘要压缩
- [ ] 情绪识别升级：接入情绪分类模型，按情绪触发胜任/自主/归属话术
- [ ] 语音留言胶囊（云存储上传，`time_capsules.voice_url` 字段已预留）
- [ ] 提醒推送（`tasks.remind_time` 字段已预留，当前仅存储不推送）
- [ ] 微信小程序端 + 微信授权登录
- [ ] 接口鉴权：把客户端传 `userId` 换成 token / session（见第七节说明）

## 二、技术栈

| 端 | 技术 | 说明 |
| --- | --- | --- |
| 后端 | Java 17 + Spring Boot 3.2.5 | IDEA 开发 |
| ORM | MyBatis-Plus 3.5.7 | 含分页插件、逻辑删除、公共字段自动填充 |
| 校验 | spring-boot-starter-validation | DTO 上用 `@Valid` / `@NotBlank` / `@Future` |
| 数据库 | MySQL 8.x | Navicat 管理，脚本见 `database/timecapsule.sql` |
| 前端 | Vue 3 + Vite 5 + Element Plus + Pinia | VSCode 开发；浅奶茶黄棕主题见 `frontend/src/styles/theme.css` |
| HTTP | Axios | 统一封装：自动解包 `data`、统一错误提示 |
| AI | 大模型 API（OpenAI 兼容接口） | 可前端配置，当前使用 DeepSeek（`deepseek-v4-pro` / `deepseek-flash`） |

## 三、项目结构

```text
timecapsule/
├── README.md                        # 本文件
├── database/
│   └── timecapsule.sql              # 建库建表 + 虚拟数据（Navicat 导入）
├── backend/                         # 后端 Spring Boot 工程（IDEA 打开）
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/timecapsule/
│       │   ├── TimeCapsuleApplication.java   # 启动类
│       │   ├── common/
│       │   │   ├── Result.java               # 统一返回结构
│       │   │   ├── BusinessException.java    # 业务异常
│       │   │   └── GlobalExceptionHandler.java # 全局异常 → 统一 Result
│       │   ├── config/
│       │   │   ├── CorsConfig.java           # 跨域（本地白名单）
│       │   │   ├── JacksonConfig.java        # 日期时间统一 yyyy-MM-dd HH:mm:ss
│       │   │   └── MybatisPlusConfig.java    # 分页插件 + 字段自动填充
│       │   ├── entity/                       # User/Task/TimeCapsule/Dialogue/Achievement
│       │   ├── mapper/                       # MyBatis-Plus Mapper
│       │   ├── service/                      # 业务逻辑（含归属校验与业务闭环）
│       │   ├── controller/                   # REST 接口
│       │   ├── ai/
│       │   │   ├── AIClient.java             # 门面：解析生效配置后调用
│       │   │   ├── AiHttpClient.java         # 传输层：按给定配置发 HTTP，不读数据库
│       │   │   ├── AiRuntimeConfig.java      # 一次调用真正生效的配置快照
│       │   │   ├── AiProperties.java         # ai.* 配置绑定（默认值来源）
│       │   │   └── PromptBuilder.java        # 「过去的你」/「何时的自己」提示词组装
│       │   ├── dto/                          # 请求体与视图对象
│       │   └── task/                         # 定时任务（胶囊到期 + 任务逾期）
│       └── resources/
│           ├── application.yml               # 数据库、MyBatis-Plus、AI 默认配置
│           └── application-local.yml         # 本机私有配置（API Key），已被 .gitignore 排除
└── frontend/                        # 前端 Vue3 工程（VSCode 打开）
    ├── package.json
    ├── vite.config.js               # 本地代理 /api → localhost:4114
    └── src/
        ├── main.js                  # 入口：先登录拿到 userId 再挂载
        ├── App.vue                  # 布局 + 左侧用户信息
        ├── router/index.js          # 路由
        ├── api/                     # request 封装 + user/task/capsule/chat/ai/knowledge/persona
        ├── stores/user.js           # 用户状态（Pinia + localStorage 持久化）
        ├── styles/theme.css         # 浅奶茶黄棕主题（覆盖 Element Plus 变量）
        ├── utils/date.js            # 日期时间互转（避免时区偏移）
        └── views/                   # 任务/胶囊/知识库/分身/对话/我的/设置 七个页面
```

## 四、数据库说明

9 张表（详见 `database/timecapsule.sql`）：

| 表 | 用途 | 说明 |
| --- | --- | --- |
| users | 用户 | `openid` 唯一索引 |
| tasks | 任务 | 含 `deleted` 逻辑删除列 |
| time_capsules | 时间胶囊 | 可关联任务，也可独立；含 `deleted` |
| dialogues | 对话记录 | **两类对话共用**：`capsule_id` 有值＝与过去的你，`persona_id` 有值＝与何时的自己 |
| achievements | 成就 | `(user_id, type, value)` 唯一索引保证不重复发放 |
| ai_config | AI 模型配置 | 单行表；字段留空表示"回落到配置文件"，所以 Key 可以只放本地 |
| knowledge_docs | 知识库文档 | 导入的个人资料，含 `deleted` |
| personas | 自我分身 | 某个时间点的自己：画像 + 说话风格 + 生成状态 |
| persona_docs | 分身↔文档关联 | `(persona_id, doc_id)` 唯一索引 |

**索引按实际查询设计**：任务列表用 `(user_id, deleted, created_at)`，胶囊列表用 `(user_id, deleted, to_date)`，
定时任务扫描用 `(status, deleted, to_date)`，胶囊对话历史用 `(capsule_id, user_id, created_at)`，
分身对话历史用 `(persona_id, user_id, created_at)`。

### Navicat 导入步骤
1. 打开 Navicat，连接你的 MySQL（记录账号密码）
2. 右键连接 →「运行 SQL 文件」→ 选择 `database/timecapsule.sql` → 开始
   （或：新建查询 → 粘贴脚本内容 → 运行）
3. 执行完出现 `timecapsule` 数据库、9 张表和虚拟数据即成功
4. 脚本可**重复执行**，每次都会重建表并重新灌入虚拟数据

### 虚拟数据（脚本已内置）
| openid | 昵称 | 数据情况 |
| --- | --- | --- |
| `test-openid-001` | 小林 | 5 个任务、5 枚胶囊（2 枚已开启）、10 条对话、5 枚成就、**4 篇知识库文档、2 个已生成好的分身** |
| `test-openid-002` | 阿May | 2 个任务、2 枚胶囊（1 枚已开启）、2 条对话、3 枚成就 |
| `test-openid-003` | 老王 | 1 个任务、1 枚胶囊（未开启）、无对话 —— 用来验证"新用户空状态" |

共 3 用户 / 8 任务 / 8 胶囊 / 14 对话 / 8 成就 / 4 知识库文档 / 2 分身。

小林的 4 篇文档（自我介绍、日记摘录、在坚持的事、学习笔记）和 2 个分身
（「2026 年 9 月的我」「2025 年冬天的我」）是配套的，导入后**直接就能演示分身对话**，不用先自己造数据。

**虚拟数据的时间全部基于 `NOW()` 相对计算**，所以任何时候导入都是"活的"：
已开启的胶囊永远在过去，未开启的永远在未来，不会因为放久了而全部过期。

## 五、本地运行步骤

### 1. 准备数据库
用 Navicat 执行 `database/timecapsule.sql`（见第四节）。默认连接 `localhost:3306`，库名 `timecapsule`。

### 2. 启动后端（IDEA）
1. IDEA 打开 `backend/` 目录（等待 Maven 下载依赖）
2. 数据库账号密码：`application.yml` 里默认是 `root/root`。
   如果你的密码不同，**推荐用环境变量覆盖**，避免把密码写进文件：
   ```bash
   set DB_USERNAME=root
   set DB_PASSWORD=你的密码
   ```
   （也可以直接改 `application.yml` 里的 `${DB_PASSWORD:root}` 默认值）
3. 运行 `TimeCapsuleApplication`
4. 看到启动日志 `TimeCapsule 启动成功` 即成功，接口地址 `http://localhost:4114/api/...`

### 端口约定

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| 前端（Vite dev server） | **4113** | 浏览器访问 `http://localhost:4113` |
| 后端（Spring Boot） | **4114** | 前端通过 Vite 代理访问，一般不直接打开 |

要改端口需要**同时**改两处：`backend/src/main/resources/application.yml` 的 `server.port`，
以及 `frontend/vite.config.js` 顶部的 `BACKEND_PORT` / `FRONTEND_PORT` 常量。
Vite 配了 `strictPort`：端口被占用会直接报错退出，而不是自动顺延到下一个端口
（顺延正好会撞上后端，问题更难查）。

> 同一个端口不能被两个进程同时监听 —— 所以前端和后端必须用两个不同的端口，
> 浏览器只访问前端那个。

### 3. 启动前端（VSCode）
```bash
cd frontend
npm install
npm run dev
```
浏览器访问 **http://localhost:4113**，**会自动以 `test-openid-001`（小林）登录**，直接就能看到完整数据。

### 4. 配置 AI 模型（二选一）

**方式 A：在前端页面里配（推荐）**

启动后进「⚙️ 设置」页：

1. 点供应商预设（DeepSeek / 豆包方舟 / 通义千问 / 自定义）自动填好端点
2. 粘贴 API Key
3. 点「拉取可用模型」→ 会真实调用该端点的 `/models` 接口，把你这个 Key 实际能用的模型列出来
4. 点「测试连接」→ 发一次真实请求确认能通
5. 点「保存配置」→ 存进数据库 `ai_config` 表，**优先级高于配置文件**

界面上的 Key 只显示掩码（如 `sk-976****08e5`），明文永远不会返回给前端；
保存时 Key 留空表示"不改动已有的 Key"。

**方式 B：写进本地配置文件**

`backend/src/main/resources/application-local.yml`（已被 `.gitignore` 排除，不会提交）：

```yaml
ai:
  base-url: https://api.deepseek.com/chat/completions
  model: deepseek-v4-pro
  api-key: sk-你的key
```

`application.yml` 默认激活 `local` profile，所以这个文件开箱即用。

**两者关系**：`ai_config` 表的**非空字段**逐项覆盖配置文件。所以可以把 Key 只放在本地文件里
（数据库和 SQL 脚本里都不留明文），只在前端换模型；也可以完全在前端配。

> **未配置 Key 时**：不会发起网络请求，对话直接返回兜底文案，其余功能完全不受影响。
> 即使配了 Key，调用失败（超时 / 401 / 模型名不存在）也只会退回兜底文案并把失败原因附在回复里，不会 500。

### 5. 完整体验流程
1. **任务页**：新建任务 → 填"给未来的话"和胶囊开启时间 → 创建（任务与胶囊同一事务生成）
2. **任务页**：点「完成」→ 观察左侧用户信息里连续打卡/等级变化
3. **胶囊页**：未开启的胶囊正文是隐藏的（保持封存感），可以手动提前开启（有二次确认）
4. **对话页**：选择已开启胶囊 → 多轮对话；再发一条，模型能看到前面的上下文
5. **知识库页**：导入文档（直接粘贴，或选 `.txt`/`.md` 文件自动读成文本）；小林已有 4 篇种子文档
6. **我的分身页**：创建分身 → 命名 + 选时间点 + 勾选材料 → 看状态从「生成中」自动变成「已就绪」，
   然后能读到 LLM 蒸馏出的**人物画像**与**说话风格**
7. **对话页**：顶部切到「🪞 何时的自己」→ 选一个分身 → 对话；分身会引用知识库里你写过的真实内容
8. **设置页**：切换供应商/模型、拉取可用模型、测试连接
9. **我的页**：查看等级、连续打卡、完成数、成就徽章；可切换 3 个测试账号验证数据互不干扰

## 六、API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/users/login?openid=xx | 登录/注册 |
| GET | /api/users/{id} | 用户信息 |
| PUT | /api/users/{id} | 修改昵称/头像（body 需带 userId） |
| GET | /api/tasks?userId=1 | 任务列表 |
| POST | /api/tasks | 创建任务（可带 `capsuleContent`/`capsuleToDate` 同时封存胶囊） |
| PUT | /api/tasks/{id} | 编辑任务（body 需带 userId） |
| DELETE | /api/tasks/{id}?userId=1 | 删除任务（逻辑删除） |
| POST | /api/tasks/{id}/complete?userId=1 | 完成任务（幂等，触发成就/打卡/等级） |
| POST | /api/tasks/{id}/abandon?userId=1 | 放弃任务 |
| GET | /api/capsules?userId=1 | 胶囊列表 |
| GET | /api/capsules/opened?userId=1 | 已开启的胶囊（对话页用） |
| POST | /api/capsules | 单独封存胶囊 |
| POST | /api/capsules/{id}/open?userId=1 | 开启胶囊（幂等） |
| POST | /api/chat/past-self | 与"过去的你"对话 |
| GET | /api/chat/history?userId=1&capsuleId=1 | 胶囊对话历史 |
| POST | /api/chat/persona | 与"何时的自己"对话 |
| GET | /api/chat/persona-history?userId=1&personaId=1 | 分身对话历史 |
| GET | /api/achievements?userId=1 | 成就列表 |
| **AI 配置** | | |
| GET | /api/ai/config | 当前 AI 配置（**Key 只返回掩码**） |
| PUT | /api/ai/config | 保存配置（Key 留空＝不改动已有 Key） |
| POST | /api/ai/config/test | 测试连通性（真实调用一次大模型） |
| GET | /api/ai/models | 拉取该 Key 实际可用的模型列表 |
| **知识库** | | |
| GET | /api/knowledge?userId=1 | 文档列表（含预览，不含全文） |
| GET | /api/knowledge/{id}?userId=1 | 文档详情（含全文） |
| POST | /api/knowledge | 导入文档 |
| DELETE | /api/knowledge/{id}?userId=1 | 删除文档（逻辑删除） |
| **我的分身** | | |
| GET | /api/personas?userId=1 | 分身列表 |
| GET | /api/personas/{id}?userId=1 | 分身详情（画像 + 引用文档，前端也用它轮询生成状态） |
| POST | /api/personas | 创建分身（**异步生成**，返回时状态为 GENERATING） |
| POST | /api/personas/{id}/regenerate?userId=1 | 用同样的材料重新生成 |
| DELETE | /api/personas/{id}?userId=1 | 删除分身 |

### 返回格式约定
统一返回 `{ "code": 200, "message": "success", "data": ... }`。

- **HTTP 状态码恒为 200**，业务结果看 body 里的 `code`（200 成功 / 400 参数或业务错误 / 403 越权 / 404 不存在 / 405 方法不支持 / 500 服务端异常）
- 任何异常（包括参数校验失败、路径不存在）都会经过 `GlobalExceptionHandler` 转成这个结构，
  不会再出现 Spring 默认的 `{timestamp,status,error,path}` 结构
- 日期时间统一 `yyyy-MM-dd HH:mm:ss`（本地时间，东八区）

## 七、核心设计与实现要点

### 与"过去的你"对话（提示词核心）
```text
你是用户的"过去的自己"。
用户在 {写胶囊时间} 写下了这段话：「{胶囊内容}」，当时 TA 正在为任务「{任务名称}」努力。
现在距离写下这段话已经过去了一段时间，任务目前的状态是：{进行中/已完成/已逾期/已放弃，含截止时间}。
请以当时的 TA 的身份与现在的用户对话：
- 用"我"指代当时的自己，用"你"指代现在的用户
- 语气真诚、温和、有期待，不评判、不指责
- 先回顾期待，再询问进展，最后共情鼓励
- 不虚构事实，不代替用户做决定
```
消息组装顺序：`system(人设+胶囊原文+任务现状)` + `最近 10 条历史(user/assistant)` + `本轮用户消息`。

### 知识库 → 「何时的自己」（v2 核心）
```text
导入个人资料（自我介绍/日记/笔记）
        ↓
创建分身：命名 + 指定时间点 + 勾选材料
        ↓
异步蒸馏：把材料送给大模型，产出两段 ——「画像」+「说话风格」
        ↓
对话：按用户这句话从知识库召回相关片段，注入 system 作为"记忆"
```

**为什么"生成"要单独做一步**：直接把几千字材料塞进每轮对话，token 成本高、还会被无关内容干扰。
先蒸馏成一份 300 字左右的人物档案，之后每轮只带档案 + 当次召回的几个片段，既像本人又便宜。

**为什么是异步的**：一次蒸馏实测十几秒。同步做接口会长时间挂住、前端只能转圈；
现在改成「建记录(GENERATING) → 后台线程生成 → 回写 READY/FAILED」，前端轮询状态即可。
触发时机用 Spring 的 `afterCommit`，确保后台线程一定能读到刚插入的关联表数据。

**召回复核怎么做的**：中文没有空格分词，这里用「相邻两字（bigram）命中数 ÷ √片段长度」打分排序 ——
零依赖、可解释，对"我写过的自述性文字"效果够用。数据量大后应换成 embedding + 向量库（已列入后续规划）。

### AI 配置的三层回落
```text
数据库 ai_config 表的非空字段   ← 前端「设置」页写进来的
        ↓ 该字段为空时回落
application-local.yml           ← 本机私有，已被 .gitignore 排除
        ↓ 该字段为空时回落
application.yml 的 ai.* 默认值   ← 开箱即用的默认端点
```
逐字段回落而不是整份覆盖，好处是：**真实 API Key 可以只放在本地文件里**，
数据库和 SQL 脚本中都不留明文；用户在前端只想换模型时也不必把 Key 再填一遍。

### 业务闭环
```text
完成任务 → ① 状态置 1 + 记录完成时间
         ② 按累计完成数发放「任务完成」里程碑成就
         ③ 回算连续打卡天数（从今天或昨天往前数连续有完成记录的天数）
         ④ 成长等级 = 完成任务数 / 5 + 1
         ⑤ 按连续天数发放「连续打卡」里程碑成就

开启胶囊（手动或定时任务） → 按累计开启数发放「胶囊开启」成就
```
连续打卡"从昨天起算"是有意的：否则每天早上打开页面都会看到打卡断了。

### 心理学理论落地
- **未来自我连续性**：时间胶囊把"未来的自己"人格化；成长等级与连续打卡让"未来的我"可见；远期任务拆解对抗时间贴现
- **自我决定理论**：自主（用户自定义任务与胶囊时间）、胜任（成就徽章/里程碑反馈）、归属（"过去的你"作为长期见证者）

### ⚠️ 安全边界（上线前必读）
当前是**本地演示版本，没有接口鉴权**：身份靠客户端传 `userId` / `openid`，任何人只要改参数就能看别人的数据。

已经做到的部分：
- 所有按 id 的写操作（编辑/删除/完成/放弃/开启/对话）都会校验 `userId` 归属，**不能操作别人的记录**
- 请求体用专用 DTO，客户端无法通过 `userId`/`status`/`completedAt` 越权写入
- CORS 只放行本机页面（`app.cors.allowed-origin-patterns`，默认 `http://localhost:*` / `http://127.0.0.1:*`），
  公网站点读不到接口。用通配端口而不是写死端口，是为了改前端端口时不用回来动配置
- 已移除原先对所有人开放的"手动发放成就"测试接口

**尚未做到**：无法阻止攻击者"换成别人的 userId 去读"。要解决必须引入 token / session 鉴权
（约 1~2 天工作量，涉及后端安全过滤器和前端请求头），属于第七节后续规划。

## 八、后续规划

1. **接口鉴权**：引入 Spring Security + JWT，身份从 token 取，不再信任客户端传参
2. **部署云平台**：后端 `mvn package` 部署到云服务器/容器；前端 `npm run build` 产物放 Nginx
   （注意 `router` 用的是 history 模式，Nginx 需要配 `try_files $uri $uri/ /index.html`）
3. **微信小程序**：后端接口不变，新增小程序端，登录改为微信授权换 openid
4. **提醒推送**：接入微信订阅消息 / 邮件，消费 `remind_time`
5. **AI 能力增强**：情绪识别模型、成长报告生成、超长上下文摘要
6. **前端优化**：Element Plus 改按需引入（当前全量引入，产物 1.1MB → 可压到 300KB 左右）

## 九、本次改造要点（相对初版骨架）

| 类别 | 修复内容 |
| --- | --- |
| 可用性 | 首屏 `userId` 为 null 导致任务页 400/空表 → 应用启动先登录 + `localStorage` 持久化 |
| 可用性 | 不填截止时间时胶囊用"当前时间"兜底，创建即到期被自动开启 → 改为跟随截止时间或 7 天后 |
| 数据正确性 | 前端直接提交 JS Date 序列化成 UTC，导致时间整体偏移 8 小时 → 统一 `yyyy-MM-dd HH:mm:ss` |
| 数据正确性 | 对话无多轮上下文，"过去的你"不记得上一句 → 注入最近 10 条历史 |
| 数据正确性 | 任务与胶囊分两次请求创建，第二步失败会留下半成品 → 合并为一个事务 |
| 数据正确性 | 逻辑删除配置是死配置（表里没有 `deleted` 列）→ 补齐列 + `@TableLogic` |
| 数据正确性 | 成就"先查后插"并发会重复发放 → 加唯一索引 + 捕获唯一键冲突 |
| 稳定性 | `RestTemplate` 无超时，AI 卡住会占死 Tomcat 线程 → 配置连接/读取超时 |
| 稳定性 | AI 错误响应下 `choices.get(0)` 空指针 → 结构判断 + 带出供应商错误信息 |
| 稳定性 | 未配置 key 也要先发一次注定失败的请求 → 显式判断，直接走兜底 |
| 稳定性 | 定时任务逐条 `selectById + updateById`，且与手动开启存在竞态 → 条件更新 + 批量 UPDATE |
| 稳定性 | 异常响应不是 `Result` 结构，前端拦截器判断失效 → 全局异常处理器 |
| 业务闭环 | 连续打卡/成长等级/成就字段从来没人写 → 完成与开启时自动计算并发放 |
| 业务闭环 | `remind_time`、`status=2 已逾期` 无人使用 → 逾期由定时任务自动标记 |
| 安全 | `PUT/DELETE/complete` 不校验归属，可操作任意用户数据 → 全部加归属校验 |
| 安全 | `@RequestBody Task` 整实体绑定可篡改 `userId`/`status` → 改用专用 DTO |
| 安全 | CORS `allowedOriginPatterns("*")` + `allowCredentials(true)` → 收紧为本地白名单 |
| 安全 | 公开的"手动发放成就"测试接口 → 移除 |
| 工程化 | 无参数校验 → 引入 validation；无分页插件 → 补上；SQL 日志直打 stdout → 走 Slf4j |
| 工程化 | 索引与查询不匹配、`idx_status` 选择度极低 → 按实际查询重建索引 |
| 文档 | 数据库脚本补全虚拟数据，并按 `NOW()` 相对时间生成，随时导入都是"活的" |

## 十、v2 新增模块（AI 配置 / 知识库 / 我的分身）

| 模块 | 实现要点 |
| --- | --- |
| AI 模型配置 | 配置存库 + 三层回落；**Key 只返回掩码**，留空保存＝不改动；支持真实拉取 `/models` 与一键测试连接 |
| 配置分层 | `AiHttpClient`（只发请求，不读配置）+ `AIClient`（解析生效配置后调用）拆分，避免"配置服务要测连接"造成的循环依赖 |
| 知识库 | 粘贴或上传 txt/md；列表只返回预览、详情才给全文；归属校验覆盖增删查 |
| 分身生成 | 后台线程池异步蒸馏；提示词用固定标记分两段输出（比让模型吐 JSON 稳），解析失败时降级为整段当画像 |
| 分身健壮性 | 服务启动时把上次中断、仍停在 `GENERATING` 的记录重置为失败，避免前端永远转圈 |
| 分身对话 | 按当前消息召回知识片段注入 system；胶囊对话与分身对话共用 `dialogues` 表，靠 `capsule_id`/`persona_id` 区分 |
| 前端 | 新增「设置」「知识库」「我的分身」三页；对话页支持切换对话对象；生成中自动轮询 |
| 安全 | 新模块的所有按 id 操作同样校验归属；跨用户读写分身/知识库均返回 404 |
