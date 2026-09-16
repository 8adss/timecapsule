/**
 * 对话领域逻辑。
 *
 * 两种对话对象共用这一层：
 * - **「过去的你」**：人设来自一枚时间胶囊的原文（写下那句话时的 TA）
 * - **「何时的自己」**：人设来自分身的画像与说话风格，再按当前这句话
 *   召回它引用过的材料作为「记得的事」
 *
 * ## 从旧版搬过来时，只做了一件改动
 *
 * 提示词与召回算法**逐条照搬、不改意图**——提示词是这个产品的灵魂
 * （共情—提问—鼓励三段式），召回算法是当初对照着调过的。搬过来时只把它们变成
 * **零依赖的纯函数**，于是每一条都能单测，也不必起一个 Spring 才能验证。
 *
 * 唯一的改动是**中英两份提示词**：旧版只有中文，而新版是双语应用，
 * 英文界面下拿中文提示词会让模型用中文回答。语言由调用方当参数传进来
 * （与 `domain/demo.js` 同一个做法），这一层照样不 import i18n。
 */
import { DomainError, requireMaxLength } from './errors.js'
import { newId } from './id.js'
import { AI_LIMITS } from './ai.js'
import { CAPSULE_STATUS, TASK_STATUS } from './constants.js'
import { PERSONA_STATUS, visiblePersonas } from './persona.js'
import { nowDateTimeString } from './time.js'

/** 两种对话对象。 */
export const CHAT_MODE = Object.freeze({
  CAPSULE: 'capsule',
  PERSONA: 'persona'
})

/**
 * 对话记录的角色。
 *
 * `user` 是用户说的，另外两个是 AI 说的——分成两个取值而不是统一的 `ai`，
 * 是为了让一条记录自己就能说清「它是在扮演谁」，统计与排查时不必回查关联表。
 */
export const DIALOGUE_ROLE = Object.freeze({
  USER: 'user',
  PAST_SELF: 'ai_past_self',
  PERSONA: 'ai_persona'
})

/**
 * 情绪标签。
 *
 * **存的是代号不是文案**：旧版存的是中文（`平静`/`挫败`…），而这一版是双语的，
 * 存中文会让英文界面上冒出一个中文小标签。文案在 locales 的 `emotion.*` 里。
 */
export const EMOTION = Object.freeze({
  CALM: 'calm',
  FRUSTRATED: 'frustrated',
  HESITANT: 'hesitant',
  LONELY: 'lonely',
  JOYFUL: 'joyful'
})

/** 各处上限。条数取自旧版的默认配置（`historyLimit = 10`、`knowledgeLimit = 6`）。 */
export const CHAT_LIMITS = Object.freeze({
  /** 单条用户消息长度（与旧版输入框的 maxlength 一致） */
  message: 2_000,
  /** 注入提示词的最近对话条数 */
  history: 10,
  /** 召回的记忆片段数 */
  snippets: 4,
  /** 分块目标字数，旧版常量 `CHUNK_TARGET` */
  chunkTarget: 400,
  /** 单条召回片段落进提示词时的上限，防止一片就吃掉整个上下文 */
  snippetChars: 500,
  /**
   * 一条对话记录落盘时的长度上限，**与 `AI_LIMITS.content` 是同一个数**。
   *
   * 必须一致，理由见 `AI_LIMITS.content` 的说明：存得进去却发不出去的记录，
   * 会让那段对话在下一轮永久卡死。用户消息在 `checkMessage` 那一层已经卡到
   * 2000 了，这个上限是给**模型回复**兜底的。
   */
  dialogueContent: AI_LIMITS.content,
  /**
   * 一次请求里所有消息加起来的总预算。
   *
   * 只按「条数」截断历史是不够的：每条上限 8000、十条就是 80000，
   * 足够把请求顶出 `AI_LIMITS.requestChars`。所以装配时按总预算往回装。
   * 24000 字（中文约 72KB）对任何一家模型都远在上下文之内。
   */
  promptChars: 24_000,
  /** 胶囊原文进提示词时的上限：正文本身可以很长（导入的备份允许到 65535） */
  capsuleInPrompt: 4_000
})

/** 工具：取语言对应的那份文案，不认识的语言回落到中文。 */
const pick = (table, lang) => table[lang] ?? table['zh-CN']

/**
 * 截断到 `max` 个字符。
 *
 * 只用在「必须保证发得出去」的地方：转发函数对每条消息有自己的上限，
 * 超了就是 400——而历史里那条记录每一轮都会被重放，于是**这段对话从此
 * 再也发不出去**，用户除了清空没有别的出路。宁可截断，也不要留一个死局。
 */
const clip = (text, max) => (text.length > max ? text.slice(0, max) : text)

// ---------------------------------------------------------------------------
// 情绪识别
// ---------------------------------------------------------------------------

/**
 * 关键词表。**中文在前、英文在后**，两套都会被检查——
 * 英文界面的用户不该永远得到「平静」（旧版只有中文关键词，那对英文用户等于没有）。
 */
const EMOTION_KEYWORDS = Object.freeze([
  { emotion: EMOTION.FRUSTRATED, words: ['失败', '没做到', '搞砸', '好难', '做不到', '没用', 'frustrat', 'failed', 'messed up', 'too hard', "can't do", 'useless'] },
  { emotion: EMOTION.HESITANT, words: ['要不要', '犹豫', '坚持', '是不是', '该不该', 'hesitat', 'not sure', 'should i', 'whether'] },
  { emotion: EMOTION.LONELY, words: ['一个人', '孤独', '没劲', '没人', '空虚', 'lonely', 'alone', 'no one', 'empty'] },
  { emotion: EMOTION.JOYFUL, words: ['完成', '做到了', '开心', '过了', '成功', '谢谢', 'finished', 'did it', 'happy', 'succeeded', 'thank'] }
])

/**
 * 给用户说的话打一个情绪标签。
 *
 * 按关键词粗略分类，命中即返回、**顺序敏感**（先判挫败再判喜悦：
 * 「终于完成了，好难」这种句子两边都命中，优先记下更重的那个情绪）。
 * 它只用于列表上的一个小标签，不参与任何判断，所以粗糙是可以接受的。
 *
 * @param {string} message
 * @returns {string} EMOTION 里的取值
 */
export function detectEmotion(message) {
  const text = typeof message === 'string' ? message.toLowerCase() : ''

  for (const group of EMOTION_KEYWORDS) {
    if (group.words.some((word) => text.includes(word))) {
      return group.emotion
    }
  }
  return EMOTION.CALM
}

// ---------------------------------------------------------------------------
// 记忆召回（照搬旧版 KnowledgeService.retrieve 的算法）
// ---------------------------------------------------------------------------

/**
 * 中文相邻两字切片（bigram）。
 *
 * 中文没有空格分词，用 bigram 近似关键词：只保留汉字与字母数字，
 * 标点和空白一律丢弃。
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function bigrams(text) {
  const cleaned = typeof text === 'string' ? text.replace(/[^\p{Script=Han}\p{Alphabetic}\p{Nd}]/gu, '') : ''
  const grams = new Set()
  for (let i = 0; i + 2 <= cleaned.length; i += 1) {
    grams.add(cleaned.slice(i, i + 2))
  }
  return grams
}

/**
 * 按行切段，再合并到约 `target` 字一片（**不切开任何一行**）。
 *
 * 不按固定字数硬切是有原因的：中文材料里一行往往就是一句话或一个要点，
 * 从中间切开会让召回出来的片段读起来是半句。
 *
 * @param {string} content
 * @param {number} [target]
 * @returns {string[]}
 */
export function chunkContent(content, target = CHAT_LIMITS.chunkTarget) {
  if (typeof content !== 'string' || content.trim() === '') return []

  const chunks = []
  let buffer = ''

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line === '') continue

    if (buffer !== '' && buffer.length + line.length > target) {
      chunks.push(buffer)
      buffer = ''
    }
    buffer = buffer === '' ? line : `${buffer}\n${line}`
  }

  if (buffer !== '') chunks.push(buffer)
  return chunks
}

/**
 * 按关键词召回与 query 最相关的若干片段。
 *
 * 打分 = 命中的 bigram 数 ÷ √片段长度。除以长度是为了避免长片段
 * 仅因为字多就排到前面。命中 0 个的片段直接丢掉，**不要注入空上下文**。
 *
 * 范围是调用方给的 `docs`——对本应用来说就是**这个分身引用的那几篇**：
 * 分身的定义就是「这几篇材料的蒸馏」，从别处召回会让它提起自己没经历过的事。
 *
 * @param {string} query - 用户这一句话
 * @param {Array<{title: string, content: string}>} docs
 * @param {number} [limit]
 * @returns {Array<{source: string, text: string}>} 按相关度降序
 */
export function retrieveSnippets(query, docs, limit = CHAT_LIMITS.snippets) {
  if (typeof query !== 'string' || query.trim() === '' || limit <= 0) return []

  const queryGrams = bigrams(query)
  if (queryGrams.size === 0) return []

  const scored = []
  for (const doc of docs ?? []) {
    for (const chunk of chunkContent(doc?.content)) {
      let hit = 0
      for (const gram of queryGrams) {
        if (chunk.includes(gram)) hit += 1
      }
      if (hit > 0) {
        scored.push({ source: doc.title ?? '', text: chunk, score: hit / Math.sqrt(Math.max(1, chunk.length)) })
      }
    }
  }

  scored.sort((left, right) => right.score - left.score)

  return scored.slice(0, limit).map((item) => ({
    source: item.source,
    text: item.text.length > CHAT_LIMITS.snippetChars
      ? item.text.slice(0, CHAT_LIMITS.snippetChars)
      : item.text
  }))
}

// ---------------------------------------------------------------------------
// 提示词
// ---------------------------------------------------------------------------

/** 任务状态的说法，进提示词用，所以要跟着语言走。 */
const TASK_STATUS_TEXT = Object.freeze({
  'zh-CN': {
    [TASK_STATUS.ONGOING]: '进行中',
    [TASK_STATUS.DONE]: '已完成',
    [TASK_STATUS.OVERDUE]: '已逾期',
    [TASK_STATUS.ABANDONED]: '已放弃'
  },
  'en-US': {
    [TASK_STATUS.ONGOING]: 'in progress',
    [TASK_STATUS.DONE]: 'completed',
    [TASK_STATUS.OVERDUE]: 'overdue',
    [TASK_STATUS.ABANDONED]: 'abandoned'
  }
})

/**
 * 把关联任务描述成一句话：「进行中，截止 2026-10-01」。
 * 没有关联任务时给一个中性的说法，而不是留空——留空会让提示词出现「任务目前的状态是：。」
 */
export function describeTask(task, lang = 'zh-CN') {
  const text = pick(TASK_STATUS_TEXT, lang)
  if (!task) return lang === 'en-US' ? 'not linked to a task' : '没有关联任务'

  const status = text[task.status] ?? text[TASK_STATUS.ONGOING]
  const due = typeof task.dueDate === 'string' && task.dueDate !== '' ? task.dueDate.slice(0, 10) : ''

  if (due === '') return status
  return lang === 'en-US' ? `${status}, due ${due}` : `${status}，截止 ${due}`
}

/** 两种角色的提示词模板。`{...}` 占位由各自的构建函数填充。 */
const PROMPTS = Object.freeze({
  'zh-CN': {
    pastSelf: ({ capsuleContent, writeDate, taskTitle, taskStatusDesc }) => [
      '你是用户的"过去的自己"。',
      `用户在 ${writeDate} 写下了这段话：「${capsuleContent}」，当时 TA 正在为任务「${taskTitle}」努力。`,
      `现在距离写下这段话已经过去了一段时间，任务目前的状态是：${taskStatusDesc}。`,
      '请以当时的 TA 的身份与现在的用户对话：',
      '- 用第一人称"我"指代当时的自己，用"你"指代现在的用户',
      '- 语气真诚、温和、带着期待与关心，不评判、不指责',
      '- 先回顾当时的期待，再询问现在的进展，最后给予共情与鼓励',
      '- 不虚构事实，不提供虚假安慰；不代替用户做决定',
      '- 若用户流露挫败情绪，先共情，再引用其已完成的部分给予胜任感',
      '- 若用户犹豫拖延，重申决定权在用户自己手中，呼应当初的期待',
      '- 若用户感到孤独缺乏动力，以长期见证者的口吻给予归属感',
      '- 回答控制在 150 字以内，不要写成说教长文，不要使用 Markdown 标题和列表'
    ].join('\n'),

    persona: ({ name, selfDate, summary, stylePrompt, snippets }) => {
      const parts = [
        `你就是用户的「${name}」——${selfDate} 那个时候的 TA 本人。`,
        '现在用户在和你说话，你要用第一人称「我」，以那个时间点的自己的身份回应。',
        '',
        '【你的人物档案】',
        summary.trim() === '' ? '（暂无画像，请依据材料自然表达）' : summary.trim(),
        ''
      ]

      if (stylePrompt.trim() !== '') {
        parts.push('【你的说话风格】', stylePrompt.trim(), '')
      }

      if (snippets.length > 0) {
        parts.push('【你记得的事实材料】')
        for (const snippet of snippets) {
          parts.push(`- ${snippet.text.replace(/\s+/g, ' ').trim()}`)
        }
        parts.push('这些是你自己经历过的事，可以自然地提起，但不要原样背诵，也不要编造材料里没有的经历。', '')
      }

      parts.push([
        '对话要求：',
        '- 用第一人称「我」指代自己，用「你」指代现在的用户',
        '- 保持档案里的人设和说话风格，不要退化成通用助手',
        '- 先接住对方的情绪，再回应内容；不评判、不指责',
        '- 不虚构事实，不确定的事就直说不知道',
        '- 回答控制在 150 字以内，不要使用 Markdown 标题和列表'
      ].join('\n'))

      return parts.join('\n')
    }
  },

  'en-US': {
    pastSelf: ({ capsuleContent, writeDate, taskTitle, taskStatusDesc }) => [
      'You are the user\'s "past self".',
      `On ${writeDate} the user wrote this: “${capsuleContent}”. Back then they were working toward the task “${taskTitle}”.`,
      `Some time has passed since. The task's current status is: ${taskStatusDesc}.`,
      'Now speak to the user as who they were back then:',
      '- Refer to your past self as "I" and to the user as "you"',
      '- Be sincere and warm, with expectation and care; never judge or blame',
      '- Look back at what you hoped for then, ask how it is going now, and close with empathy and encouragement',
      '- Do not invent facts and do not offer empty comfort; do not make decisions for the user',
      '- If the user sounds frustrated, empathise first, then point to what they have already finished to restore their sense of competence',
      '- If the user is hesitating or putting things off, remind them the decision is theirs, and echo what they hoped for at the start',
      '- If the user feels lonely or has no motivation, speak as a long-term witness and give them a sense of belonging',
      '- Keep the reply under 150 words, do not lecture, and do not use Markdown headings or lists'
    ].join('\n'),

    persona: ({ name, selfDate, summary, stylePrompt, snippets }) => {
      const parts = [
        `You are the user's “${name}” — the user themself at ${selfDate}.`,
        'The user is talking to you now. Speak in the first person, as who you were at that point in time.',
        '',
        '【Your profile】',
        summary.trim() === '' ? '(No profile yet — express yourself from the material below.)' : summary.trim(),
        ''
      ]

      if (stylePrompt.trim() !== '') {
        parts.push('【How you speak】', stylePrompt.trim(), '')
      }

      if (snippets.length > 0) {
        parts.push('【Things you remember】')
        for (const snippet of snippets) {
          parts.push(`- ${snippet.text.replace(/\s+/g, ' ').trim()}`)
        }
        parts.push('These are things you lived through. You may bring them up naturally, but do not recite them word for word, and do not invent experiences that are not in the material.', '')
      }

      parts.push([
        'Requirements:',
        '- Refer to yourself as "I" and to the user as "you"',
        '- Stay in character and keep the speaking style; do not degrade into a generic assistant',
        '- Acknowledge the feeling first, then respond to the content; never judge or blame',
        '- Do not invent facts; say plainly when you do not know something',
        '- Keep the reply under 150 words; do not use Markdown headings or lists'
      ].join('\n'))

      return parts.join('\n')
    }
  }
})

/**
 * 「过去的你」的系统提示词。
 *
 * @param {{content: string, createdAt: string, task?: object}} capsule - 已开启的胶囊
 * @param {string} [lang]
 * @returns {string}
 */
export function buildPastSelfSystem(capsule, lang = 'zh-CN') {
  return pick(PROMPTS, lang).pastSelf({
    // 正文本身可以很长（导入的备份允许到 65535 字），进提示词前先截一刀，
    // 否则光这一条就能顶穿单条消息上限
    capsuleContent: clip(
      typeof capsule?.content === 'string' ? capsule.content.trim() : '',
      CHAT_LIMITS.capsuleInPrompt
    ),
    writeDate: typeof capsule?.createdAt === 'string' ? capsule.createdAt.slice(0, 16) : '',
    taskTitle: capsule?.task?.title || (lang === 'en-US' ? 'a wish' : '一个心愿'),
    taskStatusDesc: describeTask(capsule?.task, lang)
  })
}

/**
 * 「何时的自己」的系统提示词。
 *
 * @param {object} persona - 分身
 * @param {Array<{source: string, text: string}>} [snippets] - 召回到的记忆片段
 * @param {string} [lang]
 * @returns {string}
 */
export function buildPersonaSystem(persona, snippets = [], lang = 'zh-CN') {
  return pick(PROMPTS, lang).persona({
    name: persona?.name ?? '',
    selfDate: persona?.selfDate ?? '',
    summary: typeof persona?.summary === 'string' ? persona.summary : '',
    stylePrompt: typeof persona?.stylePrompt === 'string' ? persona.stylePrompt : '',
    snippets: Array.isArray(snippets) ? snippets : []
  })
}

/**
 * 组装一次请求要发给模型的完整 messages。
 *
 * 顺序：`system` → 最近若干轮历史 → 本轮用户消息。
 *
 * 历史是**从最近一条往回装**的，装到「条数」或「字符总预算」先用完为止。
 * 只按条数截断不够：一条超长的记录就能把整个请求顶穿上限，
 * 而一旦超限，转发函数会拒收——历史里那条记录每一轮都会被重放，
 * 这段对话就永远发不出去了。所以这里必须保证**装出来的东西一定发得出去**。
 *
 * @param {object} params
 * @param {string} params.mode - CHAT_MODE 的取值
 * @param {object} params.target - 胶囊或分身
 * @param {Array} [params.docs] - 分身引用的那几篇文档（召回用）
 * @param {Array} [params.history] - 已有的对话记录（时间正序，不含本轮）
 * @param {string} params.message - 本轮用户消息
 * @param {string} [params.lang]
 * @returns {Array<{role: string, content: string}>}
 */
export function buildChatMessages({ mode, target, docs = [], history = [], message, lang = 'zh-CN' }) {
  const system = mode === CHAT_MODE.PERSONA
    ? buildPersonaSystem(target, retrieveSnippets(message, docs), lang)
    : buildPastSelfSystem(target, lang)

  // 各处上限已经保证系统提示词远小于 AI_LIMITS.content（见 chat.test.js 里
  // 那条「把一切都拉满」的用例）。这里的 clip 是最后一道保险：
  // 万一将来有人调大了某个上限，也不至于让请求发不出去。
  const head = { role: 'system', content: clip(system, AI_LIMITS.content) }
  const tail = { role: 'user', content: clip(message, CHAT_LIMITS.message) }

  let budget = CHAT_LIMITS.promptChars - head.content.length - tail.content.length
  const recent = []

  for (let i = history.length - 1; i >= 0 && recent.length < CHAT_LIMITS.history; i -= 1) {
    const content = clip(history[i].content, AI_LIMITS.content)
    // 装不下就停：要的是一段**连续**的最近历史，不是跳着捡几条短的
    if (content.length > budget) break
    budget -= content.length
    recent.unshift({
      role: history[i].role === DIALOGUE_ROLE.USER ? 'user' : 'assistant',
      content
    })
  }

  return [head, ...recent, tail]
}

// ---------------------------------------------------------------------------
// 对话记录
// ---------------------------------------------------------------------------

/**
 * 构造一条对话记录。
 *
 * @param {{capsuleId?: string, personaId?: string, role: string, content: string, emotionTag?: string}} input
 * @param {Date} [now]
 * @returns {object}
 */
export function buildDialogue(input, now = new Date()) {
  const content = typeof input.content === 'string' ? input.content : ''
  if (content.trim() === '') {
    throw new DomainError('对话内容不能为空', { key: 'errors.dialogueContentRequired' })
  }

  const timestamp = nowDateTimeString(now)

  return {
    id: newId(),
    capsuleId: input.capsuleId ?? null,
    personaId: input.personaId ?? null,
    role: input.role,
    // 截断而不是报错，理由见 CHAT_LIMITS.dialogueContent
    content: content.slice(0, CHAT_LIMITS.dialogueContent),
    // 情绪标签只打在用户说的话上；AI 的回复没有这个字段
    emotionTag: input.role === DIALOGUE_ROLE.USER ? (input.emotionTag ?? EMOTION.CALM) : null,
    deleted: 0,
    createdAt: timestamp,
    // 与 createdAt 相同。存在的意义是**备份合并**：合并按 updatedAt 取较新者，
    // 而「逻辑删除」会把它顶到更晚的时间。少了它，一份较旧的备份
    // 反而会把已经删掉的对话复活。
    updatedAt: timestamp
  }
}

/** 可见的对话记录（排除逻辑删除）。 */
export function visibleDialogues(list) {
  return list.filter((item) => item.deleted !== 1)
}

/** 按时间正序（对话要从上往下读）。 */
export function sortDialogues(list) {
  return [...list].sort((left, right) => (
    left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0
  ))
}

/**
 * 取某个对话对象的历史。
 * @param {Array} list
 * @param {{capsuleId?: string, personaId?: string}} target
 */
export function historyFor(list, target) {
  const wanted = target?.capsuleId
    ? (item) => item.capsuleId === target.capsuleId
    : (item) => item.personaId === target?.personaId

  return sortDialogues(visibleDialogues(list).filter(wanted))
}

/** 这条记录属于哪种对话对象。 */
export function modeOfDialogue(dialogue) {
  return dialogue?.personaId ? CHAT_MODE.PERSONA : CHAT_MODE.CAPSULE
}

// ---------------------------------------------------------------------------
// 可对话的对象
// ---------------------------------------------------------------------------

/**
 * 校验并取出用户这一轮要说的那句话。
 *
 * 放在领域层，并且要在**发网络请求之前**调用：消息超长如果等到落盘时才发现，
 * 那次模型调用已经花掉了，用户却什么都没得到。
 *
 * @param {unknown} text
 * @returns {string} 去掉两端空白后的正文
 */
export function checkMessage(text) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (value === '') {
    throw new DomainError('请先输入内容', { key: 'errors.dialogueContentRequired' })
  }
  requireMaxLength(value, CHAT_LIMITS.message, `消息超过 ${CHAT_LIMITS.message} 字上限`, {
    key: 'errors.dialogueTooLong'
  })
  return value
}

/**
 * 可以对话的分身：必须**已就绪**。
 *
 * 草稿与生成中的分身还没有画像，跟它们对话等于跟一个空壳说话。
 * （这一期画像都是手写的，建出来就是已就绪，所以实际过不掉的是别的状态。）
 */
export function chattablePersonas(list) {
  return visiblePersonas(list).filter((item) => item.status === PERSONA_STATUS.READY)
}

/** 取出要对话的分身；不存在就抛错，而不是静默换一个。 */
export function pickPersona(list, id) {
  const persona = visiblePersonas(list).find((item) => item.id === id)
  if (!persona) {
    throw new DomainError('分身不存在', { key: 'errors.personaNotFound' })
  }
  if (persona.status !== PERSONA_STATUS.READY) {
    throw new DomainError('这个分身还没有准备好', { key: 'errors.personaNotReady' })
  }
  return persona
}

/**
 * 取出要对话的胶囊：**只有已开启的**才行。
 *
 * 封存中的胶囊还属于未来，与它对话等于提前拆封——那会毁掉这个产品最基本的仪式感。
 * 列表那一侧也做了同样的限制（`listTargets` 只列已开启的），这里再挡一次是因为
 * 「已开启」是数据的性质，不该只靠调用方自觉。
 */
export function pickCapsule(list, id) {
  const capsule = list.find((item) => item.id === id && item.deleted !== 1)
  if (!capsule) {
    throw new DomainError('胶囊不存在', { key: 'errors.capsuleNotFound' })
  }
  if (capsule.status !== CAPSULE_STATUS.OPENED) {
    throw new DomainError('这枚胶囊还没有开启', { key: 'errors.chatCapsuleNotOpened' })
  }
  return capsule
}
