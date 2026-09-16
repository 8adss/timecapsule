/**
 * 首次打开时写入的示例内容。
 *
 * 新用户打开一个空应用，光看空表和引导文案，其实很难明白「知识库」和「我的分身」
 * 到底在干什么。所以第一次进来时先放一份示例：三篇示例文档 + 一个引用它们的示例分身，
 * 横幅上标明这是示例、可以一键清空。
 *
 * 四条设计约定：
 *
 * 1. **中英各一份，跟随首次打开时的界面语言。** 它们是**被写进数据库的数据**，
 *    不是界面文案——所以不能从 locales 里取（那样会变成"数据随语言实时变"，
 *    用户切一次语言，自己 DB 里的东西就换了一种语言）。
 *    取值由调用方把当前语言**当参数传进来**，本模块照样是零依赖的纯数据。
 *
 * 2. **标题一律带「示例 ·」前缀。** 用户一眼能认出哪些不是自己写的。
 *
 * 3. **只写一次，且只在知识库与分身都还空着的时候写。** 已经用过这两页的人
 *    不该被塞进示例内容。判定逻辑在 `shouldSeedDemo`，是个纯函数，好测。
 *
 * 4. **示例标记记在 `meta` 里**（写了哪几条的 id），不往记录本身加字段。
 *    这样不必改备份的白名单校验——那种校验会把不认识的字段直接丢掉，
 *    标记会在导出一趟之后消失。而 `meta` 的既有定位正是「描述本地环境状态、
 *    不属于用户数据」，本来就不进备份，性质刚好对上。
 */
import { buildDoc, SOURCE_TYPE } from './knowledge.js'
import { buildPersona } from './persona.js'
import { nowDateTimeString } from './time.js'

/** 中文示例内容。 */
const ZH_CN = {
  docs: [
    {
      title: '示例 · 关于我',
      content: `我叫小林，今年 29 岁，在一家做企业软件的公司写后端。

写代码这件事我做了七年。最开始是因为喜欢「把想法变成能跑的东西」的那一下，
现在更多是因为习惯了——每天打开编辑器，把一件事拆开、做完、提交，这一天就算有着落。

我不算特别外向的人。人多的场合我会往边上站，但如果聊到我在意的话题，
我会一口气说很久，事后又觉得自己说多了。

最近几年我慢慢承认了一件事：我真正想要的不是「更厉害」，而是「更踏实」——
知道自己在做什么、为什么做，并且第二天还愿意继续做。`
    },
    {
      title: '示例 · 最近在想的事',
      content: `十月三日，晴。

今天下班路上想通一件小事。我一直在等一个「准备好了」的时刻——等这个项目结束、
等手上的事少一点、等我把该学的都学会。但好像那个时刻不会来。
它不是一个会自己出现的日子，它只能是我决定开始的那一秒。

所以我想换个做法：不等了。想写的东西今天写两百字，想学的东西今天看十分钟。
小到不可能失败，但每天都做。

另外，我发现自己对「记录」这件事有抵触。总觉得要等做出点成绩才值得写下来。
可回头看，那些没做成的事、半路放弃的想法，其实也是我的一部分。
如果只记成功的，那记录下来的就不是我，是一个我希望成为的人。`
    },
    {
      title: '示例 · 今年的三个目标',
      content: `还剩三个月，把今年的目标重新理一遍，只留三件：

一、把「写给未来的自己」这个小工具做完，并且真的发布出去。
    不为别的，就是想体验一次「从想法到有人用」的完整过程。

二、每周至少跑三次，每次五公里。不看配速，只看有没有去。

三、每个月读完一本书，读完写三百字。写不出来就说明没读进去。

其它想做的事先记在纸上，明年再说。今年就这三件。`
    }
  ],
  persona: {
    name: '示例 · 那时的我',
    summary: `一个做了七年后端、正在学着「不等准备好再开始」的人。

在意的事情很具体：把手上的东西做完、把想法变成能跑的东西、每天有一点进展。
不太外向，人多的场合会往边上站；但聊到在意的话题会一口气说很久。

最近正在经历从「想变得更厉害」转向「想活得更踏实」的阶段，
对「记录」这件事还带着一点别扭——总觉得要有成绩才值得写下来。`,
    stylePrompt: `说话直接，不绕弯子，喜欢用短句。

不太用「我觉得」「可能吧」这类软化词，但也不会把话说死。
偶尔会用一个具体的场景或数字来说明，而不是讲道理。
不用感叹号，不用网络流行语，不刻意煽情。
被问到不确定的事，会直接说「这个我还没想清楚」。`
  }
}

/** 英文示例内容。 */
const EN_US = {
  docs: [
    {
      title: 'Sample · About me',
      content: `My name is Lin. I'm 29, and I write backend code at a company that builds enterprise software.

I've been writing code for seven years. It started because I loved that moment when an idea turns into something that actually runs. These days it's more habit than love — open the editor, break a problem down, finish it, commit, and the day has a shape.

I'm not a particularly outgoing person. At crowded gatherings I drift toward the edge. But if the conversation lands on something I care about, I'll talk for a long time, and afterwards feel like I said too much.

One thing I've slowly admitted to myself: what I actually want isn't to be "more impressive", it's to be "steadier" — to know what I'm doing and why, and to still want to keep doing it tomorrow.`
    },
    {
      title: 'Sample · What I keep thinking about',
      content: `October 3rd, clear.

On the way home from work today I figured out something small. I've been waiting for a moment when I'm "ready" — waiting for this project to end, for my plate to be less full, for me to have learned the things I'm supposed to learn. But that moment doesn't seem to arrive. It isn't a date that shows up on its own; it can only be the second I decide to start.

So I want to try something different: stop waiting. Two hundred words today on the thing I want to write. Ten minutes today on the thing I want to learn. Small enough that failing is impossible — but every day.

I've also noticed that I resist the idea of keeping records. It feels like I should have accomplished something before it's worth writing down. But looking back, the things that didn't work out, the ideas I dropped halfway, are part of me too. If I only write down the wins, what I've recorded isn't me — it's a person I hope to become.`
    },
    {
      title: 'Sample · Three goals for this year',
      content: `Three months left. Rewriting this year's goals, keeping only three:

1. Finish "write to your future self" — this small tool — and actually ship it. Not for any other reason than to go through the whole arc, from an idea to someone using it.

2. Run at least three times a week, five kilometres each time. Not looking at pace, only at whether I went.

3. Finish one book a month and write three hundred words about it. If I can't write it, I probably didn't really read it.

Everything else I want to do goes on paper, for next year. This year: just these three.`
    }
  ],
  persona: {
    name: 'Sample · Who I was then',
    summary: `Someone who has written backend code for seven years, and is learning to stop waiting until he feels ready.

What he cares about is concrete: finishing what's in front of him, turning ideas into something that runs, making a little progress every day.
Not very outgoing — at crowded gatherings he drifts toward the edge; but on a topic he cares about he'll talk for a long time.

He's currently moving from "wanting to be more impressive" toward "wanting to be steadier", and is still a little uncomfortable with the idea of keeping records — it feels like there ought to be something to show first.`,
    stylePrompt: `Talks plainly, doesn't circle around a point, prefers short sentences.

Rarely uses softeners like "I think" or "maybe", but doesn't state things as absolutes either.
Sometimes explains with a concrete scene or a number rather than a general principle.
No exclamation marks, no internet slang, no deliberate sentimentality.
When something is uncertain, says straight out: "I haven't figured that part out yet."`
  }
}

/** 两种语言的示例内容。新增语言时在这里补一份即可。 */
export const DEMO_CONTENT = Object.freeze({
  'zh-CN': ZH_CN,
  'en-US': EN_US
})

/** 兜底语言：传入不认识的语言标识时用它。 */
export const DEFAULT_DEMO_LOCALE = 'zh-CN'

/**
 * 取某种语言的示例内容，不认识的语言回落到中文。
 * @param {string} [lang]
 * @returns {{ docs: Array, persona: object }}
 */
export function demoContentFor(lang) {
  return DEMO_CONTENT[lang] ?? DEMO_CONTENT[DEFAULT_DEMO_LOCALE]
}

/**
 * 示例内容该不该写入。
 *
 * 三个条件同时成立才写：从没写过示例、知识库里没有东西、也没有任何分身。
 * 后两条是为了**跳过已经在用这两页的人**——他们不需要示例，
 * 被塞进来反而像是数据被污染了。
 *
 * @param {{ meta?: object, knowledge?: Array, personas?: Array }} state
 * @returns {boolean}
 */
export function shouldSeedDemo(state = {}) {
  const { meta, knowledge, personas } = state
  if (meta && meta.demoSeededAt) return false
  if ((knowledge ?? []).length > 0) return false
  if ((personas ?? []).length > 0) return false
  return true
}

/**
 * 从 meta 里取出示例记录的 id。
 * @param {object} [meta]
 * @returns {{ knowledge: string[], personas: string[] }}
 */
export function demoIdsFrom(meta) {
  const ids = meta?.demoIds ?? {}
  return {
    knowledge: Array.isArray(ids.knowledge) ? ids.knowledge : [],
    personas: Array.isArray(ids.personas) ? ids.personas : []
  }
}

/**
 * 示例内容的当前状态，供横幅决定「显不显示」。
 *
 * 判据是**示例记录里还有几条活着**，而不是「写没写过」：
 * 用户自己把示例删掉之后，横幅就该跟着消失，不必再点一次「清空示例」。
 *
 * @param {{ meta?: object, knowledge?: Array, personas?: Array }} state
 * @returns {{ active: boolean, dismissed: boolean, docCount: number, personaCount: number }}
 */
export function demoStateFrom(state = {}) {
  const { meta, knowledge, personas } = state
  const ids = demoIdsFrom(meta)
  const docIds = new Set(ids.knowledge)
  const personaIds = new Set(ids.personas)

  const docCount = (knowledge ?? []).filter((doc) => docIds.has(doc.id) && doc.deleted !== 1).length
  const personaCount = (personas ?? []).filter((item) => personaIds.has(item.id) && item.deleted !== 1).length

  return {
    active: docCount + personaCount > 0,
    dismissed: meta?.demoDismissed === true,
    docCount,
    personaCount
  }
}

/**
 * 生成一份示例内容（已通过正常校验的真实实体，可直接落盘）。
 *
 * 走 `buildDoc` / `buildPersona` 而不是手写对象：这样示例数据与用户自己建的
 * 数据**经过完全相同的校验**，不会出现「示例能存进去、用户照着建却存不进去」。
 *
 * @param {string} [lang] - 界面语言
 * @param {Date} [now] - 参考时刻
 * @returns {{ docs: Array, personas: Array }}
 */
export function buildDemoSeed(lang, now = new Date()) {
  const content = demoContentFor(lang)

  const docs = content.docs.map((doc) => buildDoc({
    title: doc.title,
    content: doc.content,
    sourceType: SOURCE_TYPE.PASTE
  }, now))

  const persona = buildPersona({
    name: content.persona.name,
    // 代表时间点取写入当天：「那时的我」总得落在某个具体的日子上
    selfDate: nowDateTimeString(now).slice(0, 10),
    docIds: docs.map((doc) => doc.id),
    summary: content.persona.summary,
    stylePrompt: content.persona.stylePrompt
  }, now)

  return { docs, personas: [persona] }
}

/**
 * 写示例之后的新 meta。
 *
 * `demoSeededAt` 一写就不再清除：**清空示例之后不会又冒出来一份**。
 * 要再看示例，得清空全部数据（那时 meta 也会被一起重置）。
 *
 * @param {object} [meta] - 现有 meta
 * @param {{ docs: Array, personas: Array }} seed
 * @param {Date} [now]
 * @returns {object} 新的 meta
 */
export function buildDemoMeta(meta, seed, now = new Date()) {
  return {
    ...(meta ?? {}),
    demoSeededAt: nowDateTimeString(now),
    demoIds: {
      knowledge: seed.docs.map((doc) => doc.id),
      personas: seed.personas.map((item) => item.id)
    }
  }
}
