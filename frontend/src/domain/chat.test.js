import { describe, it, expect } from 'vitest'
import {
  buildChatMessages,
  buildDialogue,
  buildPastSelfSystem,
  buildPersonaSystem,
  bigrams,
  chunkContent,
  describeTask,
  detectEmotion,
  historyFor,
  modeOfDialogue,
  retrieveSnippets,
  sortDialogues,
  visibleDialogues,
  CHAT_LIMITS,
  CHAT_MODE,
  DIALOGUE_ROLE,
  EMOTION
} from './chat.js'
import { AI_LIMITS, checkMessages } from './ai.js'
import { TASK_STATUS } from './constants.js'

const NOW = new Date(2026, 8, 15, 10, 0, 0)

const capsule = (over = {}) => ({
  id: 'c1',
  content: '我要在三个月内跑完半马，不管多慢都不许停。',
  createdAt: '2026-06-01 21:30:00',
  status: 1,
  ...over
})

const persona = (over = {}) => ({
  id: 'p1',
  name: '2026 年 9 月的我',
  selfDate: '2026-09-01',
  summary: '正在把一个想法做成产品，说话直接。',
  stylePrompt: '用短句，不用感叹号。',
  docIds: ['d1'],
  ...over
})

describe('detectEmotion', () => {
  it('认出挫败', () => {
    expect(detectEmotion('今天又没做到，好难')).toBe(EMOTION.FRUSTRATED)
  })

  it('认出犹豫', () => {
    expect(detectEmotion('我在犹豫要不要继续坚持')).toBe(EMOTION.HESITANT)
  })

  it('认出孤独', () => {
    expect(detectEmotion('最近总是一个人，挺没劲的')).toBe(EMOTION.LONELY)
  })

  it('认出喜悦', () => {
    expect(detectEmotion('我终于做到了，谢谢那时的我')).toBe(EMOTION.JOYFUL)
  })

  it('都没有命中时是平静', () => {
    expect(detectEmotion('今天下雨了')).toBe(EMOTION.CALM)
  })

  it('顺序敏感：挫败优先于喜悦（「终于完成了，好难」该记下更重的那个）', () => {
    expect(detectEmotion('终于完成了，好难')).toBe(EMOTION.FRUSTRATED)
  })

  it('英文界面下也能认出来（旧版只有中文关键词，对英文用户等于没有）', () => {
    expect(detectEmotion('I failed again')).toBe(EMOTION.FRUSTRATED)
    expect(detectEmotion('not sure I should keep going')).toBe(EMOTION.HESITANT)
    expect(detectEmotion('I feel so lonely')).toBe(EMOTION.LONELY)
    expect(detectEmotion('I finally finished it, thank you')).toBe(EMOTION.JOYFUL)
  })

  it('空值与非字符串不炸', () => {
    expect(detectEmotion(null)).toBe(EMOTION.CALM)
    expect(detectEmotion(undefined)).toBe(EMOTION.CALM)
    expect(detectEmotion(123)).toBe(EMOTION.CALM)
  })
})

describe('bigrams', () => {
  it('切出相邻两字', () => {
    expect([...bigrams('跑步')]).toEqual(['跑步'])
    expect([...bigrams('今天跑步')]).toEqual(['今天', '天跑', '跑步'])
  })

  it('丢掉标点与空白（中文没有空格分词，标点是噪音）', () => {
    expect([...bigrams('今天，跑步。')]).toEqual(['今天', '天跑', '跑步'])
    expect([...bigrams('a b, c')]).toEqual(['ab', 'bc'])
  })

  it('英文按字母切，不区分大小写由调用方负责', () => {
    expect(bigrams('run').size).toBe(2)
  })

  it('太短或空的文本给空集合', () => {
    expect(bigrams('我').size).toBe(0)
    expect(bigrams('').size).toBe(0)
    expect(bigrams(null).size).toBe(0)
  })
})

describe('chunkContent', () => {
  it('按行合并到约 400 字一片', () => {
    const line = 'x'.repeat(100)
    const chunks = chunkContent([line, line, line, line, line].join('\n'))
    // 3 × 100 + 2 个换行 = 302；再加第 4 行（401）就超了，所以首片是 3 行
    expect(chunks).toHaveLength(2)
    expect(chunks[0].split('\n')).toHaveLength(3)
    expect(chunks[1].split('\n')).toHaveLength(2)
  })

  it('不切开任何一行（否则召回出来是半句话）', () => {
    const long = 'y'.repeat(900)
    expect(chunkContent(long)).toEqual([long])
  })

  it('空行被跳过，不会产生空片段', () => {
    expect(chunkContent('第一行\n\n\n第二行')).toEqual(['第一行\n第二行'])
  })

  it('空内容给空数组', () => {
    expect(chunkContent('')).toEqual([])
    expect(chunkContent('   \n  ')).toEqual([])
    expect(chunkContent(null)).toEqual([])
  })

  it('可以自定义目标字数', () => {
    expect(chunkContent('a\nb\nc', 2)).toEqual(['a\nb', 'c'])
  })
})

describe('retrieveSnippets', () => {
  const docs = [
    { title: '关于我', content: '我喜欢在清晨跑步，那时候街上很安静。' },
    { title: '日记', content: '今天加班到很晚，没能去跑步，有点挫败。' }
  ]

  it('挑出与这句话相关的片段', () => {
    const result = retrieveSnippets('最近跑步坚持得怎么样', docs)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((item) => typeof item.text === 'string')).toBe(true)
  })

  it('带上来源标题，便于排查召回对不对', () => {
    const result = retrieveSnippets('跑步', docs)
    expect(result.some((item) => item.source === '关于我' || item.source === '日记')).toBe(true)
  })

  it('一个字都没命中时返回空数组（不要注入空上下文）', () => {
    expect(retrieveSnippets('量子力学', docs)).toEqual([])
  })

  it('相关度高的排前面', () => {
    const result = retrieveSnippets('跑步', docs)
    // 两篇都含「跑步」，短的那片应该因为除以 √长度 而胜出
    expect(result[0].text.includes('跑步')).toBe(true)
  })

  it('遵守条数上限', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, content: `跑步第${i}天` }))
    expect(retrieveSnippets('跑步', many, 3)).toHaveLength(3)
  })

  it('**只在传进来的文档里找**（分身的记忆范围就是它引用的那几篇）', () => {
    const other = { title: '别处', content: '我养了一只叫跑步的猫' }
    const result = retrieveSnippets('跑步', docs)
    expect(result.some((item) => item.text.includes('猫'))).toBe(false)
    // 传进去才会被找到
    expect(retrieveSnippets('跑步', [other]).some((item) => item.text.includes('猫'))).toBe(true)
  })

  it('单条片段超长时被截断，不会一片吃掉整个上下文', () => {
    const huge = { title: '长文', content: `跑步${'z'.repeat(CHAT_LIMITS.snippetChars * 2)}` }
    const result = retrieveSnippets('跑步', [huge])
    expect(result[0].text).toHaveLength(CHAT_LIMITS.snippetChars)
  })

  it('空查询、空文档、limit 为 0 都返回空数组', () => {
    expect(retrieveSnippets('', docs)).toEqual([])
    expect(retrieveSnippets('   ', docs)).toEqual([])
    expect(retrieveSnippets('跑步', [])).toEqual([])
    expect(retrieveSnippets('跑步', docs, 0)).toEqual([])
    expect(retrieveSnippets(null, docs)).toEqual([])
  })
})

describe('describeTask', () => {
  it('有截止日期时带上日期', () => {
    const task = { title: '跑半马', status: TASK_STATUS.ONGOING, dueDate: '2026-10-01 00:00:00' }
    expect(describeTask(task, 'zh-CN')).toBe('进行中，截止 2026-10-01')
  })

  it('四种状态都有说法', () => {
    const statuses = [TASK_STATUS.ONGOING, TASK_STATUS.DONE, TASK_STATUS.OVERDUE, TASK_STATUS.ABANDONED]
    for (const status of statuses) {
      expect(describeTask({ status }, 'zh-CN')).toBeTruthy()
    }
    expect(describeTask({ status: TASK_STATUS.DONE }, 'zh-CN')).toBe('已完成')
  })

  it('没有关联任务时给中性说法，而不是留空', () => {
    // 留空会让提示词出现「任务目前的状态是：。」这种东西
    expect(describeTask(null, 'zh-CN')).toBe('没有关联任务')
    expect(describeTask(null, 'en-US')).toBe('not linked to a task')
  })

  it('英文界面给英文', () => {
    const task = { status: TASK_STATUS.OVERDUE, dueDate: '2026-10-01 00:00:00' }
    expect(describeTask(task, 'en-US')).toBe('overdue, due 2026-10-01')
  })
})

describe('buildPastSelfSystem', () => {
  it('把胶囊原文、写下时间、任务与状态都写进提示词', () => {
    const prompt = buildPastSelfSystem(capsule({
      task: { title: '跑半马', status: TASK_STATUS.ONGOING, dueDate: '2026-10-01 00:00:00' }
    }))
    expect(prompt).toContain('我要在三个月内跑完半马')
    expect(prompt).toContain('2026-06-01 21:30')
    expect(prompt).toContain('跑半马')
    expect(prompt).toContain('进行中')
  })

  it('保留旧版那三条心理学策略（这是这个产品的灵魂）', () => {
    const prompt = buildPastSelfSystem(capsule())
    expect(prompt).toContain('挫败')
    expect(prompt).toContain('决定权在用户自己手中')
    expect(prompt).toContain('长期见证者')
  })

  it('保留长度与格式约束', () => {
    const prompt = buildPastSelfSystem(capsule())
    expect(prompt).toContain('150 字以内')
    expect(prompt).toContain('不要使用 Markdown')
  })

  it('没有关联任务时也给得出完整句子', () => {
    expect(buildPastSelfSystem(capsule())).toContain('没有关联任务')
  })

  it('英文界面给英文提示词（否则英文用户会被中文回答）', () => {
    const prompt = buildPastSelfSystem(capsule(), 'en-US')
    expect(prompt).toContain('past self')
    expect(prompt).toContain('under 150 words')
    expect(prompt).not.toContain('150 字以内')
  })

  it('胶囊内容为空时不炸', () => {
    expect(() => buildPastSelfSystem({})).not.toThrow()
  })
})

describe('buildPersonaSystem', () => {
  it('带上名称与代表时间点', () => {
    const prompt = buildPersonaSystem(persona())
    expect(prompt).toContain('2026 年 9 月的我')
    expect(prompt).toContain('2026-09-01')
  })

  it('画像与说话风格分节呈现', () => {
    const prompt = buildPersonaSystem(persona())
    expect(prompt).toContain('【你的人物档案】')
    expect(prompt).toContain('正在把一个想法做成产品')
    expect(prompt).toContain('【你的说话风格】')
    expect(prompt).toContain('用短句')
  })

  it('有召回片段时注入「你记得的事实材料」', () => {
    const snippets = [{ source: '关于我', text: '我喜欢在清晨跑步' }]
    const prompt = buildPersonaSystem(persona(), snippets)
    expect(prompt).toContain('【你记得的事实材料】')
    expect(prompt).toContain('我喜欢在清晨跑步')
    expect(prompt).toContain('不要编造材料里没有的经历')
  })

  it('没有召回片段时**不出现**那一节（不要给模型一个空标题）', () => {
    expect(buildPersonaSystem(persona(), [])).not.toContain('你记得的事实材料')
  })

  it('画像为空时给占位说明', () => {
    expect(buildPersonaSystem(persona({ summary: '' }))).toContain('暂无画像')
  })

  it('说话风格为空时整节省掉', () => {
    expect(buildPersonaSystem(persona({ stylePrompt: '' }))).not.toContain('你的说话风格')
  })

  it('保留「不要退化成通用助手」这条约束', () => {
    expect(buildPersonaSystem(persona())).toContain('不要退化成通用助手')
  })

  it('英文界面给英文提示词', () => {
    const prompt = buildPersonaSystem(persona(), [], 'en-US')
    expect(prompt).toContain('You are the user')
    expect(prompt).toContain('under 150 words')
  })
})

describe('buildChatMessages', () => {
  const history = [
    { role: DIALOGUE_ROLE.USER, content: '在吗' },
    { role: DIALOGUE_ROLE.PAST_SELF, content: '在的' }
  ]

  it('顺序是 system → 历史 → 本轮消息', () => {
    const messages = buildChatMessages({
      mode: CHAT_MODE.CAPSULE, target: capsule(), history, message: '我跑完了'
    })
    expect(messages).toHaveLength(4)
    expect(messages[0].role).toBe('system')
    expect(messages[1]).toEqual({ role: 'user', content: '在吗' })
    expect(messages[2]).toEqual({ role: 'assistant', content: '在的' })
    expect(messages[3]).toEqual({ role: 'user', content: '我跑完了' })
  })

  it('两种 AI 角色都映射成 assistant', () => {
    const messages = buildChatMessages({
      mode: CHAT_MODE.PERSONA,
      target: persona(),
      history: [{ role: DIALOGUE_ROLE.PERSONA, content: '嗯' }],
      message: '你好'
    })
    expect(messages[1].role).toBe('assistant')
  })

  it('历史只取最近的若干条（否则长对话会一直膨胀）', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ role: DIALOGUE_ROLE.USER, content: `第${i}句` }))
    const messages = buildChatMessages({
      mode: CHAT_MODE.CAPSULE, target: capsule(), history: long, message: '现在'
    })
    expect(messages).toHaveLength(CHAT_LIMITS.history + 2)
    expect(messages[1].content).toBe('第20句')
  })

  it('分身模式下 system 里带上了召回的记忆', () => {
    const messages = buildChatMessages({
      mode: CHAT_MODE.PERSONA,
      target: persona(),
      docs: [{ title: '关于我', content: '我喜欢在清晨跑步' }],
      history: [],
      // 这句与材料共享 bigram「跑步」，所以能召回；换个毫不相干的问法就召不回
      message: '跑步的习惯还在吗'
    })
    expect(messages[0].content).toContain('我喜欢在清晨跑步')
  })

  it('胶囊模式下不会去召回（人设就是那段原文，不需要别处找）', () => {
    const messages = buildChatMessages({
      mode: CHAT_MODE.CAPSULE,
      target: capsule(),
      docs: [{ title: 'x', content: '我喜欢在清晨跑步' }],
      history: [],
      message: '跑步'
    })
    expect(messages[0].content).not.toContain('你记得的事实材料')
  })
})

/**
 * 这一组是**回归测试**，对应一次真实事故：
 *
 * 存储侧的上限（20000）一度远大于发送侧的上限（8000）。模型偶尔吐回一整篇，
 * 那条记录照样存得下来；下一轮它作为历史被重放，转发函数按 8000 拒收，
 * 于是**这段对话永远发不出去了**，用户除了清空没有别的出路。
 *
 * 所以这里断言的不是「截断」本身，而是那条不变量：
 * **凡是装出来的东西，一定发得出去。**
 */
describe('装出来的请求一定发得出去', () => {
  /** 模拟转发函数那一侧的校验：任何一条超限，请求就会被拒。 */
  const fits = (messages) => checkMessages(messages).ok

  it('存储上限与发送上限是同一个数（两边不一致就会出死局）', () => {
    expect(CHAT_LIMITS.dialogueContent).toBe(AI_LIMITS.content)
  })

  it('存下来的最长记录能原样重放', () => {
    const longest = { role: DIALOGUE_ROLE.PAST_SELF, content: 'x'.repeat(CHAT_LIMITS.dialogueContent) }
    const messages = buildChatMessages({
      mode: CHAT_MODE.CAPSULE,
      target: capsule(),
      history: [longest],
      message: '然后呢'
    })
    expect(fits(messages)).toBe(true)
  })

  it('超长的用户消息被截到 message 上限', () => {
    const messages = buildChatMessages({
      mode: CHAT_MODE.CAPSULE,
      target: capsule(),
      history: [],
      message: 'x'.repeat(CHAT_LIMITS.message * 3)
    })
    expect(messages[messages.length - 1].content).toHaveLength(CHAT_LIMITS.message)
    expect(fits(messages)).toBe(true)
  })

  it('一串满额的历史也不会把总预算顶穿（只按条数截断是不够的）', () => {
    const long = Array.from({ length: 30 }, () => ({
      role: DIALOGUE_ROLE.PAST_SELF,
      content: 'x'.repeat(AI_LIMITS.content)
    }))
    const messages = buildChatMessages({
      mode: CHAT_MODE.CAPSULE,
      target: capsule(),
      history: long,
      message: '现在'
    })

    const total = messages.reduce((sum, item) => sum + item.content.length, 0)
    expect(total).toBeLessThanOrEqual(CHAT_LIMITS.promptChars)
    expect(fits(messages)).toBe(true)
    // 装不下就少装几条，而不是跳着捡短的——要的是一段连续的最近历史
    expect(messages.length).toBeLessThan(6)
  })

  it('导入的超长胶囊不会顶穿单条上限', () => {
    const huge = capsule({ content: 'x'.repeat(65_535) })
    const messages = buildChatMessages({
      mode: CHAT_MODE.CAPSULE, target: huge, history: [], message: '你好'
    })
    expect(messages[0].content).not.toContain('x'.repeat(CHAT_LIMITS.capsuleInPrompt + 1))
    expect(fits(messages)).toBe(true)
  })

  it('把一切都拉满时，系统提示词仍在上限之内', () => {
    // 最坏情况：画像、说话风格、召回片段全部填满
    const worst = persona({
      name: 'x'.repeat(100),
      summary: 'x'.repeat(2_000),
      stylePrompt: 'x'.repeat(2_000),
      selfDate: '2026-09-01'
    })
    const docs = Array.from({ length: 20 }, (_, i) => ({
      title: `doc${i}`,
      content: `跑步${'x'.repeat(3_000)}`
    }))

    const messages = buildChatMessages({
      mode: CHAT_MODE.PERSONA, target: worst, docs, history: [], message: '跑步'
    })
    expect(messages[0].content.length).toBeLessThanOrEqual(AI_LIMITS.content)
    expect(fits(messages)).toBe(true)
    // 最要紧的那几条约束不能被截掉
    expect(messages[0].content).toContain('不要退化成通用助手')
  })
})

describe('buildDialogue', () => {
  it('用户消息带情绪标签，AI 回复不带', () => {
    const user = buildDialogue({ capsuleId: 'c1', role: DIALOGUE_ROLE.USER, content: '好难', emotionTag: EMOTION.FRUSTRATED }, NOW)
    expect(user.emotionTag).toBe(EMOTION.FRUSTRATED)

    const ai = buildDialogue({ capsuleId: 'c1', role: DIALOGUE_ROLE.PAST_SELF, content: '慢慢来' }, NOW)
    expect(ai.emotionTag).toBeNull()
  })

  it('内容为空时抛错', () => {
    expect(() => buildDialogue({ role: DIALOGUE_ROLE.USER, content: '' })).toThrow('对话内容不能为空')
    expect(() => buildDialogue({ role: DIALOGUE_ROLE.USER, content: '   ' })).toThrow('对话内容不能为空')
  })

  it('未指定的关联对象是 null，而不是 undefined', () => {
    const item = buildDialogue({ personaId: 'p1', role: DIALOGUE_ROLE.PERSONA, content: '嗯' }, NOW)
    expect(item.capsuleId).toBeNull()
    expect(item.createdAt).toBe('2026-09-15 10:00:00')
    expect(item.deleted).toBe(0)
  })
})

describe('对话记录的读写辅助', () => {
  const list = [
    { id: 'd1', capsuleId: 'c1', personaId: null, role: DIALOGUE_ROLE.USER, content: 'A', createdAt: '2026-09-01 10:00:00', deleted: 0 },
    { id: 'd2', capsuleId: 'c1', personaId: null, role: DIALOGUE_ROLE.PAST_SELF, content: 'B', createdAt: '2026-09-01 10:00:05', deleted: 0 },
    { id: 'd3', capsuleId: null, personaId: 'p1', role: DIALOGUE_ROLE.USER, content: 'C', createdAt: '2026-09-02 10:00:00', deleted: 0 },
    { id: 'd4', capsuleId: 'c1', personaId: null, role: DIALOGUE_ROLE.USER, content: 'D', createdAt: '2026-09-03 10:00:00', deleted: 1 }
  ]

  it('按对象取历史，两个对象互不串台', () => {
    expect(historyFor(list, { capsuleId: 'c1' }).map((item) => item.content)).toEqual(['A', 'B'])
    expect(historyFor(list, { personaId: 'p1' }).map((item) => item.content)).toEqual(['C'])
  })

  it('逻辑删除的不出现在历史里', () => {
    expect(historyFor(list, { capsuleId: 'c1' }).some((item) => item.content === 'D')).toBe(false)
  })

  it('按时间正序（对话要从上往下读）', () => {
    const shuffled = [list[2], list[0], list[1]]
    expect(sortDialogues(shuffled).map((item) => item.id)).toEqual(['d1', 'd2', 'd3'])
  })

  it('可见性过滤', () => {
    expect(visibleDialogues(list)).toHaveLength(3)
  })

  it('能判断一条记录属于哪种对话对象', () => {
    expect(modeOfDialogue(list[0])).toBe(CHAT_MODE.CAPSULE)
    expect(modeOfDialogue(list[2])).toBe(CHAT_MODE.PERSONA)
  })
})
