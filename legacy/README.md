# legacy —— 保留的历史实现，**不参与当前构建**

这个目录里是 TimeCapsule 早期版本的完整实现：一套 **Spring Boot + MyBatis-Plus + MySQL**
的前后端应用，以及它的建库脚本。

## 为什么还留在这里

它没有被删掉，原因有两个：

1. **它是一份可用的实现，不是废代码。** 里面沉淀了后来用 JavaScript 重写的那部分业务逻辑
   （连续打卡的计算、成长等级公式、成就里程碑、胶囊自动开启）——本地实现就是照着它逐条搬的，
   两份代码放在一起便于对照。
2. **AI 相关的部分目前只存在于这里。** 「与过去的自己对话」「知识库问答」「人格蒸馏」
   这些功能依赖服务端持有 API Key，第一版没有把它们带过来。
   二期重新设计 AI 能力时，这里的提示词构造、知识库检索、人格生成流程都是现成的参考。

## 它现在会被构建吗

**不会。** `frontend/` 是唯一参与构建的目录：

```bash
cd frontend
npm ci
npm run build     # 产物在 frontend/dist，纯静态，不需要任何后端
```

这个目录不在任何构建链路里，也没有任何构建脚本引用它。删掉它不影响应用运行。

## 如果你还是想跑起来看看

需要 JDK 17、Maven、MySQL 8。建库脚本在 `database/timecapsule.sql`。

```bash
cd legacy/backend
mvn -DskipTests package
java -jar target/timecapsule-backend-0.1.0.jar
```

默认监听 4114，数据库连接与 AI 密钥的配置方式见
`src/main/resources/application.yml` 里的注释。

> **注意**：这套服务当初是按「本机自用」设计的——**没有登录鉴权**，
> 身份完全由前端传来的 `userId` 决定。它不适合直接暴露到公网。
> 如果只是想把它跑起来玩玩，请留在本机。

## 与当前版本的关系

| | legacy（本目录） | 当前版本（`frontend/`） |
|---|---|---|
| 架构 | 前后端分离，服务端渲染数据 | 纯前端，浏览器本地存储 |
| 数据位置 | MySQL | 浏览器 IndexedDB |
| 账号 | 有用户表，靠 openid 区分 | 无账号 |
| 联网 | 必须连服务端 | 完全离线可用 |
| AI 能力 | 有 | 第一版未包含 |
| 构建产物 | jar | 静态文件 |
