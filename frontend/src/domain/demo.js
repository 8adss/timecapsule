/**
 * 首次打开时写入的示例内容。
 *
 * 新用户打开一个空应用，光看空表和引导文案，其实很难明白「知识库」「我的分身」
 * 和「对话」到底在干什么。所以第一次进来时先放一份示例：三篇示例文档、
 * 一个引用它们的示例分身，外加**一枚已开启的胶囊**，横幅上标明这是示例、可以一键清空。
 *
 * 胶囊那一枚是后补的，补的理由很实在：对话页有两种对象，「何时的自己」有分身就够了，
 * 而「过去的你」**必须有一枚已开启的胶囊**——胶囊建出来默认是封存状态，
 * 而封存中的胶囊按设计不能对话。没有这一枚，用户点进对话页只能测一半。
 * 它直接写成已开启，不走「到期自动开启」那条路。
 *
 * 五条设计约定：
 *
 * 1. **中英各一份，跟随首次打开时的界面语言。** 它们是**被写进数据库的数据**，
 *    不是界面文案——所以不能从 locales 里取（那样会变成"数据随语言实时变"，
 *    用户切一次语言，自己 DB 里的东西就换了一种语言）。
 *    取值由调用方把当前语言**当参数传进来**，本模块照样是零依赖的纯数据。
 *
 * 2. **标题一律带「示例 ·」前缀。** 用户一眼能认出哪些不是自己写的。
 *
 * 3. **自动写入只在知识库与分身都还空着的时候发生。** 已经用过这两页的人
 *    不该被塞进示例内容。判定逻辑在 `shouldSeedDemo`，是个纯函数，好测。
 *    设置页还提供了一个**手动载入**的入口（`seedNow`），那条路径不受此限制——
 *    用户自己点的，说明他就是要。
 *
 * 4. **示例标记记在 `meta` 里**（写了哪几条的 id），不往记录本身加字段。
 *    这样不必改备份的白名单校验——那种校验会把不认识的字段直接丢掉，
 *    标记会在导出一趟之后消失。而 `meta` 的既有定位正是「描述本地环境状态、
 *    不属于用户数据」，本来就不进备份，性质刚好对上。
 *
 * 5. **不发放任何成就。** 示例胶囊是直接写成已开启的，不经过 `capsuleRepo.open`，
 *    所以不会往成就墙上塞一枚「开启第 1 枚胶囊」——那是用户自己的里程碑。
 */
import { buildDoc, SOURCE_TYPE } from './knowledge.js'
import { buildPersona } from './persona.js'
import { buildCapsule, openCapsuleEntity } from './capsule.js'
import { nowDateTimeString } from './time.js'

/** 示例胶囊的写作时刻与到期时刻：相对「现在」各往前推一段时间。 */
const CAPSULE_WRITTEN_DAYS_AGO = 90
const CAPSULE_DUE_DAYS_AGO = 30
const DAY_MS = 24 * 60 * 60 * 1000

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
  },
  /**
   * 历史人物示例：「材料 + 画像」的一组。
   *
   * 与上面那个「那时的我」是同一套机制，只是材料换成了别人的文本——
   * 这正是这个产品后续想做的事之一（与历史人物、或与朋友对话）。
   * 再加更多人物，往这个数组里塞一组即可。
   *
   * 材料用《庄子》原文节选：两千多年前的文本，公共领域。
   */
  figures: [
    {
      docs: [
        {
          title: '示例 · 庄子·逍遥游（节选）',
          content: `北冥有鱼，其名为鲲。鲲之大，不知其几千里也。化而为鸟，其名为鹏。鹏之背，不知其几千里也；怒而飞，其翼若垂天之云。

且夫水之积也不厚，则其负大舟也无力。覆杯水于坳堂之上，则芥为之舟；置杯焉则胶，水浅而舟大也。

小知不及大知，小年不及大年。

若夫乘天地之正，而御六气之辩，以游无穷者，彼且恶乎待哉！故曰：至人无己，神人无功，圣人无名。`
        },
        {
          title: '示例 · 庄子·秋水（节选）',
          content: `秋水时至，百川灌河。泾流之大，两涘渚崖之间，不辩牛马。于是焉河伯欣然自喜，以天下之美为尽在己。顺流而东行，至于北海，东面而视，不见水端。于是焉河伯始旋其面目，望洋向若而叹。

井蛙不可以语于海者，拘于虚也；夏虫不可以语于冰者，笃于时也；曲士不可以语于道者，束于教也。

庄子与惠子游于濠梁之上。庄子曰：「鯈鱼出游从容，是鱼之乐也。」惠子曰：「子非鱼，安知鱼之乐？」庄子曰：「子非我，安知我不知鱼之乐？」`
        },
        {
          title: '示例 · 庄子·齐物论（节选）',
          content: `南郭子綦隐机而坐，仰天而嘘，荅焉似丧其耦。颜成子游立侍乎前，曰：「何居乎？形固可使如槁木，而心固可使如死灰乎？」

夫随其成心而师之，谁独且无师乎？

物无非彼，物无非是。自彼则不见，自知则知之。故曰：彼出于是，是亦因彼。

昔者庄周梦为胡蝶，栩栩然胡蝶也。自喻适志与！不知周也。俄然觉，则蘧蘧然周也。不知周之梦为胡蝶与？胡蝶之梦为周与？`
        }
      ],
      persona: {
        name: '示例 · 庄子',
        /*
         * 用他大致的生年当「代表时间点」。
         * 这个字段只收 `yyyy-MM-dd`（见 domain/persona.js 的 SELF_DATE_RE），
         * 所以公元前只能写成 0369 —— 是这个格式下最贴近的表示法。
         */
        selfDate: '0369-01-01',
        summary: `战国时期的宋国人，做过漆园吏，一辈子没怎么做过官。

他不跟人争对错，也很少给结论。你问他一件具体的事，他常常先讲一个故事：一条变成大鸟的鱼、一只不知道冰的夏虫、一场分不清谁在梦里的梦。
在他看来，是非、大小、有用无用，都只是站在某个角度才成立的东西——换个角度，结论就跟着换了。

说话汪洋恣肆，爱用夸张的比喻和反问；对生死得失看得很淡，但不冷。`,
        stylePrompt: `多用寓言和比喻，少下断语。
被问到具体的事，先讲一个小故事或一个画面，再顺势反问一句。
会用「且夫」「若夫」「安知」这类词，但不堆砌；句子要短。
不劝人努力，也不劝人放弃，只是把另一种看事情的角度摆出来。
被问到不确定的事，直接说「这个我不知道」——不知道本身不是丢人的事。`
      }
    }
  ],
  capsule: {
    content: `写这段话的时候，我还没开始。

那个「写给未来的自己」的小工具，我在心里想过很多遍，一行代码都还没写。
跑步也是，装备买齐了，鞋还没落地。

所以如果此刻的你正在读它，我想问的不是「做成了没有」，而是：你有没有开始？

要是还没有，也没关系。就把今天当作那一秒。`
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
  },
  /**
   * A historical figure: one more "material + profile" set.
   *
   * Same machinery as the "who I was then" set above, only the material belongs to
   * someone else — which is one of the things this product wants to grow into
   * (talking with a historical figure, or with a friend).
   *
   * The material is a rendering of passages from the Zhuangzi (4th century BC,
   * public domain). It is deliberately a plain modern rendering rather than any
   * particular published translation, so nothing here claims to be canonical.
   */
  figures: [
    {
      docs: [
        {
          title: 'Sample · Zhuangzi, "Free and Easy Wandering" (excerpt)',
          content: `In the northern darkness there is a fish, and its name is Kun. The Kun is so vast that no one knows how many thousand li it spans. It changes into a bird, and its name is Peng. The Peng's back is so vast that no one knows how many thousand li it spans; when it rouses itself and flies, its wings are like clouds hanging from the sky.

Besides, if water is not piled up deep enough, it has not the strength to carry a great boat. Tip a cup of water into a hollow in the floor, and a mustard seed will sail on it; set the cup down there and it sticks fast — the water is too shallow and the boat too large.

Small knowledge does not come up to great knowledge; a short year does not come up to a long one.

But one who rides the truth of heaven and earth, and lets the six breaths shift as they will, wandering into the endless — what does he depend on? So it is said: the utmost man has no self, the spirit man has no merit, the sage has no name.`
        },
        {
          title: 'Sample · Zhuangzi, "Autumn Floods" (excerpt)',
          content: `The autumn floods came, and a hundred streams poured into the river. It was so wide that from one bank you could not tell an ox from a horse on the other. Thereupon the Lord of the River was delighted, taking all the beauty in the world to be his own. He followed the current eastward until he came to the Northern Sea. Looking east, he saw no end to the water. Then he turned his face and sighed to the god of the sea.

A well-frog cannot be talked to about the sea: it is bound by its hollow. A summer insect cannot be talked to about ice: it is bound by its season. A scholar of one corner cannot be talked to about the Way: he is bound by his teaching.

Zhuangzi and Huizi were strolling on the bridge over the Hao. Zhuangzi said, "The minnows come out and swim at ease — that is the joy of fish." Huizi said, "You are not a fish; how do you know the joy of fish?" Zhuangzi said, "You are not me; how do you know that I do not know the joy of fish?"`
        },
        {
          title: 'Sample · Zhuangzi, "On the Equality of Things" (excerpt)',
          content: `Master Qi of the South sat leaning on a low table, looking up to heaven and sighing, as if he had lost his own body. Yancheng Ziyou stood waiting before him and asked, "What is this? Can the body really be made like a withered tree, and the mind like dead ashes?"

If a man follows his own completed heart and takes it as his teacher, who is there without a teacher?

There is nothing that is not "that"; there is nothing that is not "this". From "that" you do not see it; through "this" you know it. So it is said: "that" comes out of "this", and "this" depends on "that".

Once Zhuang Zhou dreamt he was a butterfly, fluttering about, a butterfly. He was delighted, following his own pleasure, and did not know he was Zhou. Suddenly he awoke, and there he was, plainly Zhou. He did not know whether he was Zhou dreaming he was a butterfly, or a butterfly dreaming it was Zhou.`
        }
      ],
      persona: {
        name: 'Sample · Zhuangzi',
        // His approximate birth year. The field only accepts `yyyy-MM-dd`
        // (see SELF_DATE_RE in domain/persona.js), so 0369 is as close as it gets.
        selfDate: '0369-01-01',
        summary: `A man of the state of Song in the Warring States period. He held a small post as keeper of a lacquer garden, and never really took office.

He does not argue about right and wrong, and rarely hands down conclusions. Ask him something concrete and he will usually tell a story first: a fish that becomes a great bird, a summer insect that has never known ice, a dream in which nobody can tell who is dreaming whom.
To him, right and wrong, great and small, useful and useless only hold from a certain angle — shift the angle and the conclusion shifts with it.

He speaks in vast, extravagant images, fond of exaggeration and rhetorical questions. He is untroubled by life and death, by gain and loss — but not cold about them.`,
        stylePrompt: `Use parables and images rather than verdicts.
When asked something concrete, tell a small story or paint a scene first, then turn it back with a question.
Fond of archaic turns of phrase such as "besides" and "how then", but never piled up — keep sentences short.
Do not urge effort, and do not urge giving up; simply set another angle beside the one being held.
When something is uncertain, say plainly: "That I do not know." Not knowing is not a disgrace.`
      }
    }
  ],
  capsule: {
    content: `When I wrote this, I hadn't started.

That little tool for writing to your future self — I'd thought about it many times and had not written a single line.
Running, too: I bought the gear, but the shoes never hit the road.

So if you're reading this now, what I want to ask isn't "did it work out" but: did you start?

If you haven't, that's all right too. Take today as that second.`
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
 * @returns {{ knowledge: string[], personas: string[], capsules: string[] }}
 */
export function demoIdsFrom(meta) {
  const ids = meta?.demoIds ?? {}
  return {
    knowledge: Array.isArray(ids.knowledge) ? ids.knowledge : [],
    personas: Array.isArray(ids.personas) ? ids.personas : [],
    capsules: Array.isArray(ids.capsules) ? ids.capsules : []
  }
}

/**
 * 示例内容的当前状态，供横幅决定「显不显示」。
 *
 * 判据是**示例记录里还有几条活着**，而不是「写没写过」：
 * 用户自己把示例删掉之后，横幅就该跟着消失，不必再点一次「清空示例」。
 *
 * @param {{ meta?: object, knowledge?: Array, personas?: Array, capsules?: Array }} state
 * @returns {{ active: boolean, dismissed: boolean, docCount: number, personaCount: number, capsuleCount: number }}
 */
export function demoStateFrom(state = {}) {
  const { meta, knowledge, personas, capsules } = state
  const ids = demoIdsFrom(meta)
  const docIds = new Set(ids.knowledge)
  const personaIds = new Set(ids.personas)
  const capsuleIds = new Set(ids.capsules)

  const docCount = (knowledge ?? []).filter((doc) => docIds.has(doc.id) && doc.deleted !== 1).length
  const personaCount = (personas ?? []).filter((item) => personaIds.has(item.id) && item.deleted !== 1).length
  const capsuleCount = (capsules ?? []).filter((item) => capsuleIds.has(item.id) && item.deleted !== 1).length

  return {
    active: docCount + personaCount + capsuleCount > 0,
    dismissed: meta?.demoDismissed === true,
    docCount,
    personaCount,
    capsuleCount
  }
}

/**
 * 生成一份示例内容（已通过正常校验的真实实体，可直接落盘）。
 *
 * 走 `buildDoc` / `buildPersona` / `buildCapsule` 而不是手写对象：这样示例数据
 * 与用户自己建的数据**经过完全相同的校验**，不会出现「示例能存进去、
 * 用户照着建却存不进去」。
 *
 * 内容由两部分组成：一组「那时的我」（`docs` + `persona`），
 * 以及若干组历史人物（`figures`，各带自己的材料与画像）。
 * 每组材料只被它自己那个画像引用——分身召回时只看自己引用的那几篇，
 * 所以庄子不会提起小林的事。
 *
 * 胶囊的写作时刻与到期时刻都相对 `now` 往前推（90 天前写、30 天前到期），
 * 于是它天然是一枚**已过期且已开启**的胶囊：对话页的「过去的你」立刻可用。
 * 开启走 `openCapsuleEntity`，与用户手动开启是同一条路径。
 *
 * @param {string} [lang] - 界面语言
 * @param {Date} [now] - 参考时刻
 * @returns {{ docs: Array, personas: Array, capsules: Array }}
 */
export function buildDemoSeed(lang, now = new Date()) {
  const content = demoContentFor(lang)
  const today = nowDateTimeString(now).slice(0, 10)

  /** 把一组「材料 + 画像」建成真实实体，材料与画像之间用真实 id 关联。 */
  const buildSet = (set) => {
    const docs = set.docs.map((doc) => buildDoc({
      title: doc.title,
      content: doc.content,
      sourceType: SOURCE_TYPE.PASTE
    }, now))

    const persona = buildPersona({
      name: set.persona.name,
      // 「那时的我」代表时间点取写入当天；历史人物自带一个（如庄子的生年）
      selfDate: set.persona.selfDate ?? today,
      docIds: docs.map((doc) => doc.id),
      summary: set.persona.summary,
      stylePrompt: set.persona.stylePrompt
    }, now)

    return { docs, persona }
  }

  const own = buildSet({ docs: content.docs, persona: content.persona })
  const figures = (content.figures ?? []).map(buildSet)

  const writtenAt = new Date(now.getTime() - CAPSULE_WRITTEN_DAYS_AGO * DAY_MS)
  const dueAt = new Date(now.getTime() - CAPSULE_DUE_DAYS_AGO * DAY_MS)
  const sealed = buildCapsule({
    content: content.capsule.content,
    toDate: nowDateTimeString(dueAt)
  }, writtenAt)
  const { capsule } = openCapsuleEntity(sealed, dueAt)

  return {
    docs: [...own.docs, ...figures.flatMap((item) => item.docs)],
    personas: [own.persona, ...figures.map((item) => item.persona)],
    capsules: [capsule]
  }
}

/**
 * 写示例之后的新 meta。
 *
 * `demoSeededAt` 一写就不再清除：**清空示例之后不会又冒出来一份**。
 *
 * 「清空全部数据」（设置页那个）也**不会**重置它——`clearAllData` 只清
 * `DATA_KEYS` 里的用户数据，`meta` 是本地环境状态，刻意不在其中。
 * 也就是说：见过示例的人清空数据后，得到的是一个干净的空应用，而不是又被塞回
 * 一份示例。这是有意的：用户刚刚明确要求清空，立刻再放一份与他的意图相反；
 * 而示例的作用本来就是给**没见过**的人看的。
 *
 * 反过来说，**从没见过示例**的人（比如上一期就已经在用知识库的人）清空数据后
 * 会拿到示例——因为此时三个条件重新成立，这正是我们想要的。
 * 而**想再要一份**的人，设置页有手动载入的入口（`seedNow`），不必靠清空数据来换。
 *
 * @param {object} [meta] - 现有 meta
 * @param {{ docs: Array, personas: Array, capsules: Array }} seed
 * @param {Date} [now]
 * @returns {object} 新的 meta
 */
export function buildDemoMeta(meta, seed, now = new Date()) {
  return {
    ...(meta ?? {}),
    demoSeededAt: nowDateTimeString(now),
    demoIds: {
      knowledge: seed.docs.map((doc) => doc.id),
      personas: seed.personas.map((item) => item.id),
      capsules: (seed.capsules ?? []).map((item) => item.id)
    }
  }
}
