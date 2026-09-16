/**
 * 仓储层端到端测试。
 *
 * 领域层的单测只验证「算得对不对」，这里验证**串起来之后对不对**：
 * 完成任务是否真的把任务、成就、画像三份数据一起改对了；
 * 幂等是否真的挡住了重复发放；逻辑删除是否真的从列表里消失。
 *
 * 用内存适配器而不是 mock：适配器契约与 IndexedDB 版完全一致，
 * 这样测出来的结论对真实浏览器同样成立（见 adapters/memory.js 的说明）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setAdapter } from '../storage/index.js'
import { createMemoryAdapter } from '../storage/adapters/memory.js'
import * as taskRepo from './taskRepo.js'
import * as capsuleRepo from './capsuleRepo.js'
import * as knowledgeRepo from './knowledgeRepo.js'
import * as personaRepo from './personaRepo.js'
import * as chatRepo from './chatRepo.js'
import * as aiRepo from './aiRepo.js'
import * as demoRepo from './demoRepo.js'
import * as achievementRepo from './achievementRepo.js'
import * as profileRepo from './profileRepo.js'
import { runMaintenance } from './maintenance.js'
import { TASK_STATUS, CAPSULE_STATUS, ACHIEVEMENT_TYPE } from '../domain/constants.js'
import { DIALOGUE_ROLE } from '../domain/chat.js'

beforeEach(() => {
  // 每个用例一份干净的内存存储，用例之间互不影响
  setAdapter(createMemoryAdapter())
})

/** 取某类型已解锁的里程碑数值，方便断言。 */
async function grantedValues(type) {
  const all = await achievementRepo.list()
  return all.filter((item) => item.type === type).map((item) => item.value)
}

/**
 * 建一个**真实存在**的分身（至少要引用一篇材料）。
 *
 * 对话那几条用例必须用它而不是随手写个 id：`chatRepo.appendTurn` 落盘前会
 * 重新确认分身还在，假 id 会被正确地拒掉。
 */
async function makePersona(name = '那时的我') {
  const doc = await knowledgeRepo.create({ title: `${name}的材料`, content: '我喜欢在清晨跑步。' })
  return personaRepo.create({ name, selfDate: '2026-09-01', docIds: [doc.id] })
}

describe('任务的增删改查', () => {
  it('新建后能在列表里查到', async () => {
    await taskRepo.create({ title: '晨跑' })
    const tasks = await taskRepo.list()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('晨跑')
    expect(tasks[0].status).toBe(TASK_STATUS.ONGOING)
  })

  it('修改后字段生效', async () => {
    const created = await taskRepo.create({ title: '晨跑' })
    const updated = await taskRepo.update(created.id, { title: '夜跑', description: '五公里' })
    expect(updated.title).toBe('夜跑')
    expect(updated.description).toBe('五公里')
    expect((await taskRepo.list())[0].title).toBe('夜跑')
  })

  it('删除是逻辑删除，列表里不再出现', async () => {
    const created = await taskRepo.create({ title: '晨跑' })
    await taskRepo.remove(created.id)
    expect(await taskRepo.list()).toHaveLength(0)
    // 记录仍在存储里（成就与统计需要历史），只是被标记为删除
    const raw = await taskRepo.loadTasks()
    expect(raw).toHaveLength(1)
    expect(raw[0].deleted).toBe(1)
  })

  it('操作不存在的任务抛 404', async () => {
    await expect(taskRepo.update('nope', { title: 'x' })).rejects.toThrow('任务不存在')
    await expect(taskRepo.complete('nope')).rejects.toThrow('任务不存在')
    await expect(taskRepo.remove('nope')).rejects.toThrow('任务不存在')
  })

  it('已完成的任务不能放弃', async () => {
    const created = await taskRepo.create({ title: '晨跑' })
    await taskRepo.complete(created.id)
    await expect(taskRepo.abandon(created.id)).rejects.toThrow('已完成的任务不能标记为放弃')
  })
})

describe('完成任务的业务闭环', () => {
  it('置为已完成并记录完成时间', async () => {
    const created = await taskRepo.create({ title: '晨跑' })
    const done = await taskRepo.complete(created.id)
    expect(done.status).toBe(TASK_STATUS.DONE)
    expect(done.completedAt).toBeTruthy()
  })

  it('解锁「任务完成 × 1」并在成长等级上体现', async () => {
    const created = await taskRepo.create({ title: '晨跑' })
    await taskRepo.complete(created.id)

    expect(await grantedValues(ACHIEVEMENT_TYPE.TASK_DONE)).toEqual([1])

    const profile = await profileRepo.get()
    expect(profile.streakDays).toBe(1)
    expect(profile.growthLevel).toBe(1)
  })

  it('连续完成 3 个任务解锁 1 与 3 两个里程碑', async () => {
    for (const title of ['A', 'B', 'C']) {
      const task = await taskRepo.create({ title })
      await taskRepo.complete(task.id)
    }
    expect(await grantedValues(ACHIEVEMENT_TYPE.TASK_DONE)).toEqual([1, 3])
  })

  it('重复完成同一个任务是幂等的，不会重复发成就', async () => {
    const created = await taskRepo.create({ title: '晨跑' })
    await taskRepo.complete(created.id)
    await taskRepo.complete(created.id)
    await taskRepo.complete(created.id)

    const badges = await achievementRepo.list()
    expect(badges).toHaveLength(1)
    expect(badges[0].value).toBe(1)
  })

  it('删除已完成任务会重算等级（统计是整体回算而非累加）', async () => {
    const created = await taskRepo.create({ title: '晨跑' })
    await taskRepo.complete(created.id)
    expect((await profileRepo.get()).streakDays).toBe(1)

    // 删掉之后重新完成另一个任务，触发回算
    await taskRepo.remove(created.id)
    const another = await taskRepo.create({ title: '夜跑' })
    await taskRepo.complete(another.id)

    // 被删除的那条不该再计入
    expect((await profileRepo.get()).streakDays).toBe(1)
  })
})

describe('任务与胶囊一起创建', () => {
  it('带 capsuleContent 时同时封存胶囊', async () => {
    const task = await taskRepo.create({
      title: '晨跑',
      capsuleContent: '希望三个月后的你还在坚持',
      capsuleToDate: '2099-01-01 00:00:00'
    })

    const capsules = await capsuleRepo.list()
    expect(capsules).toHaveLength(1)
    expect(capsules[0].taskId).toBe(task.id)
    expect(capsules[0].status).toBe(CAPSULE_STATUS.SEALED)
    expect(capsules[0].content).toBe('希望三个月后的你还在坚持')
  })

  it('不带 capsuleContent 时不创建胶囊', async () => {
    await taskRepo.create({ title: '晨跑' })
    expect(await capsuleRepo.list()).toHaveLength(0)
  })

  it('开启时间落在过去时整笔操作失败，不留下孤立数据', async () => {
    await expect(taskRepo.create({
      title: '晨跑',
      capsuleContent: '给你',
      capsuleToDate: '2000-01-01 00:00:00'
    })).rejects.toThrow('胶囊开启时间必须晚于当前时间')

    // 关键：任务也不该被写进去（一次 writeMany 的原子性）
    expect(await taskRepo.loadTasks()).toHaveLength(0)
    expect(await capsuleRepo.loadCapsules()).toHaveLength(0)
  })
})

describe('胶囊的开启与自动开启', () => {
  it('手动开启后解锁「胶囊开启 × 1」', async () => {
    const capsule = await capsuleRepo.create({
      content: '你好',
      toDate: '2099-01-01 00:00:00'
    })
    const opened = await capsuleRepo.open(capsule.id)

    expect(opened.status).toBe(CAPSULE_STATUS.OPENED)
    expect(opened.openedAt).toBeTruthy()
    expect(await grantedValues(ACHIEVEMENT_TYPE.CAPSULE_OPENED)).toEqual([1])
  })

  it('重复开启是幂等的', async () => {
    const capsule = await capsuleRepo.create({ content: '你好', toDate: '2099-01-01 00:00:00' })
    await capsuleRepo.open(capsule.id)
    await capsuleRepo.open(capsule.id)
    expect(await achievementRepo.list()).toHaveLength(1)
  })

  it('已开启列表只包含已开启的，且按开启时间倒序', async () => {
    const first = await capsuleRepo.create({ content: 'A', toDate: '2099-01-01 00:00:00' })
    const second = await capsuleRepo.create({ content: 'B', toDate: '2099-02-01 00:00:00' })
    await capsuleRepo.create({ content: 'C', toDate: '2099-03-01 00:00:00' })

    await capsuleRepo.open(first.id)
    await capsuleRepo.open(second.id)

    const opened = await capsuleRepo.listOpened()
    expect(opened).toHaveLength(2)
    expect(opened.every((item) => item.status === CAPSULE_STATUS.OPENED)).toBe(true)
  })

  it('开启不存在的胶囊抛 404', async () => {
    await expect(capsuleRepo.open('nope')).rejects.toThrow('胶囊不存在')
  })
})

describe('本地维护（替代后端的每分钟定时任务）', () => {
  it('到期的胶囊被自动开启并补发成就', async () => {
    // 先用一个未来时间创建，再用「未来时刻」触发维护，模拟时间流逝
    const capsule = await capsuleRepo.create({ content: '你好', toDate: '2099-01-01 00:00:00' })
    const future = new Date('2099-06-01T00:00:00')

    const result = await runMaintenance(future)

    expect(result.opened).toBe(1)
    expect(result.failed).toEqual([])
    const opened = await capsuleRepo.listOpened()
    expect(opened[0].id).toBe(capsule.id)
    expect(await grantedValues(ACHIEVEMENT_TYPE.CAPSULE_OPENED)).toEqual([1])
  })

  it('过期的进行中任务被标记为已逾期', async () => {
    const task = await taskRepo.create({ title: '晨跑', dueDate: '2020-01-01 00:00:00' })
    const result = await runMaintenance(new Date('2026-09-15T10:00:00'))

    expect(result.overdue).toBe(1)
    const tasks = await taskRepo.list()
    expect(tasks.find((item) => item.id === task.id).status).toBe(TASK_STATUS.OVERDUE)
  })

  it('没有需要处理的内容时不报错也不写脏数据', async () => {
    await taskRepo.create({ title: '没有截止时间的任务' })
    const result = await runMaintenance(new Date('2026-09-15T10:00:00'))
    expect(result).toEqual({ overdue: 0, opened: 0, failed: [] })
  })
})

describe('本机档案', () => {
  it('首次读取时自动创建默认档案', async () => {
    const profile = await profileRepo.get()
    expect(profile.nickname).toBe('新朋友')
    expect(profile.growthLevel).toBe(1)
    expect(profile.streakDays).toBe(0)
    expect(profile.createdAt).toBeTruthy()
  })

  it('createdAt 不会因重复读取而被刷新', async () => {
    const first = await profileRepo.get()
    const second = await profileRepo.get()
    expect(second.createdAt).toBe(first.createdAt)
  })

  it('修改昵称后保持不存在的字段', async () => {
    await profileRepo.get()
    const updated = await profileRepo.update({ nickname: '小林' })
    expect(updated.nickname).toBe('小林')
    expect(updated.createdAt).toBeTruthy()
  })

  it('传空昵称表示不修改，而不是清空', async () => {
    await profileRepo.update({ nickname: '小林' })
    const updated = await profileRepo.update({ nickname: '' })
    expect(updated.nickname).toBe('小林')
  })

  it('设置头像后能读回', async () => {
    await profileRepo.get()
    const updated = await profileRepo.setAvatar('data:image/webp;base64,AAAA')
    expect(updated.avatarUrl).toBe('data:image/webp;base64,AAAA')
    expect((await profileRepo.get()).avatarUrl).toBe('data:image/webp;base64,AAAA')
  })
})

describe('知识库的增删改查', () => {
  // 注意：这里不断言「两篇的先后顺序」——同一秒内创建的两篇 createdAt 完全相同，
  // 谁在前取决于排序的稳定性，那样的断言会随实现细节漂移。
  // 排序规则本身由 domain/knowledge.test.js 用不同的时间戳覆盖。
  it('导入后能在列表里查到', async () => {
    await knowledgeRepo.create({ title: '第一篇', content: '正文一' })
    await knowledgeRepo.create({ title: '第二篇', content: '正文二' })
    const docs = await knowledgeRepo.list()
    expect(docs).toHaveLength(2)
    expect(docs.map((item) => item.title)).toContain('第一篇')
    expect(docs.map((item) => item.title)).toContain('第二篇')
  })

  it('标题为空或正文为空时拒绝导入', async () => {
    await expect(knowledgeRepo.create({ title: '', content: '正文' })).rejects.toThrow('请填写标题')
    await expect(knowledgeRepo.create({ title: '标题', content: '   ' })).rejects.toThrow('正文不能为空')
  })

  it('来源与原文件名被记下来', async () => {
    const item = await knowledgeRepo.create({
      title: '日记',
      content: '今天……',
      sourceType: 'FILE',
      originName: '日记.md'
    })
    expect(item.sourceType).toBe('FILE')
    expect(item.originName).toBe('日记.md')
  })

  it('修改标题与正文后列表里是新值', async () => {
    const created = await knowledgeRepo.create({ title: '旧标题', content: '旧正文' })
    const updated = await knowledgeRepo.update(created.id, { title: '新标题', content: '新正文' })
    expect(updated.title).toBe('新标题')
    expect((await knowledgeRepo.list())[0].content).toBe('新正文')
  })

  it('正文被清空时拒绝保存，旧正文原样还在', async () => {
    const created = await knowledgeRepo.create({ title: '标题', content: '不能丢的正文' })
    await expect(knowledgeRepo.update(created.id, { content: '' })).rejects.toThrow('正文不能为空')
    expect((await knowledgeRepo.list())[0].content).toBe('不能丢的正文')
  })

  it('操作不存在的文档抛 404', async () => {
    await expect(knowledgeRepo.update('nope', { title: 'x' })).rejects.toThrow('文档不存在')
    await expect(knowledgeRepo.remove('nope')).rejects.toThrow('文档不存在')
  })

  it('删除是逻辑删除：列表里不再出现，但记录还在存储里', async () => {
    const created = await knowledgeRepo.create({ title: '晨间日记', content: '正文' })
    await knowledgeRepo.remove(created.id)
    expect(await knowledgeRepo.list()).toHaveLength(0)

    const raw = await knowledgeRepo.loadDocs()
    expect(raw).toHaveLength(1)
    expect(raw[0].deleted).toBe(1)
  })

  it('批量删除返回实际删掉的条数', async () => {
    const a = await knowledgeRepo.create({ title: 'A', content: '1' })
    const b = await knowledgeRepo.create({ title: 'B', content: '2' })
    await knowledgeRepo.create({ title: 'C', content: '3' })
    expect(await knowledgeRepo.removeMany([a.id, b.id])).toBe(2)
    expect((await knowledgeRepo.list()).map((item) => item.title)).toEqual(['C'])
  })

  it('批量删除里夹着无效 id 时不报错，也不算进条数', async () => {
    const a = await knowledgeRepo.create({ title: 'A', content: '1' })
    expect(await knowledgeRepo.removeMany([a.id, 'nope'])).toBe(1)
    expect(await knowledgeRepo.removeMany([])).toBe(0)
    expect(await knowledgeRepo.removeMany(null)).toBe(0)
  })

  it('对同一批重复批量删除不会重复计数', async () => {
    const a = await knowledgeRepo.create({ title: 'A', content: '1' })
    expect(await knowledgeRepo.removeMany([a.id])).toBe(1)
    expect(await knowledgeRepo.removeMany([a.id])).toBe(0)
  })
})

describe('分身的增删改查', () => {
  const build = (over = {}) => ({
    name: '那时的我',
    selfDate: '2026-09-01',
    docIds: ['d1'],
    summary: '画像',
    stylePrompt: '说话风格',
    ...over
  })

  it('新建后能在列表里查到', async () => {
    await personaRepo.create(build())
    const list = await personaRepo.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('那时的我')
    expect(list[0].status).toBe('READY')
  })

  it('按代表时间点由近及远排列', async () => {
    await personaRepo.create(build({ name: '早', selfDate: '2025-01-01' }))
    await personaRepo.create(build({ name: '晚', selfDate: '2026-09-01' }))
    expect((await personaRepo.list()).map((item) => item.name)).toEqual(['晚', '早'])
  })

  it('名称、时间点、材料缺一个都建不出来', async () => {
    await expect(personaRepo.create(build({ name: '' }))).rejects.toThrow('请填写分身名称')
    await expect(personaRepo.create(build({ selfDate: '' }))).rejects.toThrow('请选择代表的时间点')
    await expect(personaRepo.create(build({ docIds: [] }))).rejects.toThrow('至少要选一篇材料')
  })

  it('修改后五项都生效', async () => {
    const created = await personaRepo.create(build())
    const updated = await personaRepo.update(created.id, {
      name: '改过的',
      selfDate: '2027-01-01',
      docIds: ['d2', 'd3'],
      summary: '',
      stylePrompt: '话少了'
    })
    expect(updated.name).toBe('改过的')
    expect(updated.docIds).toEqual(['d2', 'd3'])
    expect(updated.summary).toBe('')
    expect((await personaRepo.list())[0].stylePrompt).toBe('话少了')
  })

  it('操作不存在的分身抛 404', async () => {
    await expect(personaRepo.update('nope', { name: 'x' })).rejects.toThrow('分身不存在')
    await expect(personaRepo.remove('nope')).rejects.toThrow('分身不存在')
  })

  it('删除是逻辑删除：列表里不再出现，但记录还在', async () => {
    const created = await personaRepo.create(build())
    await personaRepo.remove(created.id)
    expect(await personaRepo.list()).toHaveLength(0)

    const raw = await personaRepo.loadPersonas()
    expect(raw).toHaveLength(1)
    expect(raw[0].deleted).toBe(1)
  })
})

describe('示例内容的写入与清空', () => {
  const NOW = new Date(2026, 8, 15, 10, 0, 0)

  it('全新存储：写入三篇示例文档与一个示例分身', async () => {
    const result = await demoRepo.seedIfNeeded('zh-CN', NOW)
    expect(result.seeded).toBe(true)
    expect(await knowledgeRepo.list()).toHaveLength(3)
    expect(await personaRepo.list()).toHaveLength(1)
  })

  it('写完之后状态是「示例还在」', async () => {
    await demoRepo.seedIfNeeded('zh-CN', NOW)
    const state = await demoRepo.state()
    expect(state.active).toBe(true)
    expect(state.docCount).toBe(3)
    expect(state.personaCount).toBe(1)
  })

  it('只写一次：再调一次什么都不做', async () => {
    await demoRepo.seedIfNeeded('zh-CN', NOW)
    const second = await demoRepo.seedIfNeeded('zh-CN', NOW)
    expect(second.seeded).toBe(false)
    expect(await knowledgeRepo.list()).toHaveLength(3)
  })

  it('知识库里已经有东西时跳过——正在用的人不该被塞示例', async () => {
    await knowledgeRepo.create({ title: '我自己写的', content: '正文' })
    const result = await demoRepo.seedIfNeeded('zh-CN', NOW)
    expect(result.seeded).toBe(false)
    expect(await knowledgeRepo.list()).toHaveLength(1)
  })

  it('已经有分身时同样跳过', async () => {
    await personaRepo.create({ name: '我的', selfDate: '2026-01-01', docIds: ['x'] })
    expect((await demoRepo.seedIfNeeded('zh-CN', NOW)).seeded).toBe(false)
  })

  it('英文界面写入英文示例', async () => {
    await demoRepo.seedIfNeeded('en-US', NOW)
    expect((await knowledgeRepo.list())[0].title.startsWith('Sample')).toBe(true)
  })

  it('清空示例只删示例，用户自己写的原封不动', async () => {
    await demoRepo.seedIfNeeded('zh-CN', NOW)
    const mine = await knowledgeRepo.create({ title: '我自己写的', content: '正文' })

    const cleared = await demoRepo.clear(NOW)
    expect(cleared.docs).toBe(3)
    expect(cleared.personas).toBe(1)

    const docs = await knowledgeRepo.list()
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe(mine.id)
    expect(await personaRepo.list()).toHaveLength(0)
  })

  it('清空之后状态变为「示例没了」，横幅跟着消失', async () => {
    await demoRepo.seedIfNeeded('zh-CN', NOW)
    await demoRepo.clear(NOW)
    expect((await demoRepo.state()).active).toBe(false)
  })

  it('清空之后不会又冒出来一份（demoSeededAt 刻意保留）', async () => {
    await demoRepo.seedIfNeeded('zh-CN', NOW)
    await demoRepo.clear(NOW)
    const again = await demoRepo.seedIfNeeded('zh-CN', NOW)
    expect(again.seeded).toBe(false)
    expect(await knowledgeRepo.list()).toHaveLength(0)
  })

  it('清空是幂等的：再点一次不会报错，也不会动别的数据', async () => {
    await demoRepo.seedIfNeeded('zh-CN', NOW)
    await demoRepo.clear(NOW)
    const second = await demoRepo.clear(NOW)
    expect(second).toEqual({ docs: 0, personas: 0 })
  })

  it('「保留示例」只是不再提示，数据留着', async () => {
    await demoRepo.seedIfNeeded('zh-CN', NOW)
    await demoRepo.dismiss()

    const state = await demoRepo.state()
    expect(state.dismissed).toBe(true)
    expect(state.active).toBe(true)
    expect(await knowledgeRepo.list()).toHaveLength(3)
  })

  it('用户自己删掉示例之后，横幅也该消失（不必再点一次清空）', async () => {
    await demoRepo.seedIfNeeded('zh-CN', NOW)
    for (const doc of await knowledgeRepo.list()) {
      await knowledgeRepo.remove(doc.id)
    }
    for (const persona of await personaRepo.list()) {
      await personaRepo.remove(persona.id)
    }
    expect((await demoRepo.state()).active).toBe(false)
  })
})

describe('对话记录', () => {
  it('追加一轮对话会一次写入两条', async () => {
    const { user, ai } = await chatRepo.appendTurn({
      capsuleId: 'c1',
      message: '在吗',
      reply: '在的',
      emotionTag: 'calm'
    })

    expect(await chatRepo.loadDialogues()).toHaveLength(2)
    expect(user.role).toBe(DIALOGUE_ROLE.USER)
    expect(user.emotionTag).toBe('calm')
    // AI 那条不该有情绪标签：它只打在用户说的话上
    expect(ai.emotionTag).toBeNull()
    expect(ai.content).toBe('在的')
  })

  it('分身的 AI 角色是 ai_persona（一条记录自己就能说清它在扮演谁）', async () => {
    const persona = await makePersona()
    const { ai } = await chatRepo.appendTurn({ personaId: persona.id, message: '你好', reply: '嗯' })
    expect(ai.role).toBe(DIALOGUE_ROLE.PERSONA)
  })

  it('两个对象的历史互不串台', async () => {
    const persona = await makePersona()
    await chatRepo.appendTurn({ capsuleId: 'c1', message: '给胶囊', reply: '收到' })
    await chatRepo.appendTurn({ personaId: persona.id, message: '给分身', reply: '在' })

    const capsuleHistory = await chatRepo.history({ capsuleId: 'c1' })
    const personaHistory = await chatRepo.history({ personaId: persona.id })
    expect(capsuleHistory.map((item) => item.content)).toEqual(['给胶囊', '收到'])
    expect(personaHistory.map((item) => item.content)).toEqual(['给分身', '在'])
  })

  it('按时间正序返回（对话要从上往下读）', async () => {
    await chatRepo.appendTurn({ capsuleId: 'c1', message: '第一句', reply: '第一答' })
    await chatRepo.appendTurn({ capsuleId: 'c1', message: '第二句', reply: '第二答' })
    const list = await chatRepo.history({ capsuleId: 'c1' })
    expect(list[0].content).toBe('第一句')
    expect(list[3].content).toBe('第二答')
  })

  it('清空只影响这一个对象', async () => {
    const persona = await makePersona()
    await chatRepo.appendTurn({ capsuleId: 'c1', message: 'A', reply: 'a' })
    await chatRepo.appendTurn({ personaId: persona.id, message: 'B', reply: 'b' })

    expect(await chatRepo.removeByTarget({ capsuleId: 'c1' })).toBe(2)
    expect(await chatRepo.history({ capsuleId: 'c1' })).toEqual([])
    expect(await chatRepo.history({ personaId: persona.id })).toHaveLength(2)
  })

  it('清空是逻辑删除：记录仍在存储里，备份要带上它', async () => {
    await chatRepo.appendTurn({ capsuleId: 'c1', message: 'A', reply: 'a' })
    await chatRepo.removeByTarget({ capsuleId: 'c1' })
    expect(await chatRepo.loadDialogues()).toHaveLength(2)
    expect((await chatRepo.loadDialogues())[0].deleted).toBe(1)
  })

  it('清空一个没有对话的对象是安全的（不会误删别人）', async () => {
    await chatRepo.appendTurn({ capsuleId: 'c1', message: 'A', reply: 'a' })
    expect(await chatRepo.removeByTarget({ capsuleId: 'nope' })).toBe(0)
    expect(await chatRepo.history({ capsuleId: 'c1' })).toHaveLength(2)
  })
})

describe('删分身时连它的对话一起删', () => {
  it('分身没了，跟它的对话也没了', async () => {
    const persona = await makePersona('九月的我')
    await chatRepo.appendTurn({ personaId: persona.id, message: '在吗', reply: '在的' })

    await personaRepo.remove(persona.id)

    expect(await chatRepo.history({ personaId: persona.id })).toEqual([])
    // 存储里仍有墓碑——它要进备份，合并时靠 updatedAt 压住更旧的那份
    const raw = await chatRepo.loadDialogues()
    expect(raw).toHaveLength(2)
    expect(raw.every((item) => item.deleted === 1)).toBe(true)
    expect(raw[0].updatedAt).toBeTruthy()
  })

  it('不会牵连别的分身的对话', async () => {
    const keep = await makePersona('八月的我')
    const drop = await makePersona('七月的我')
    await chatRepo.appendTurn({ personaId: keep.id, message: '留下', reply: '好' })
    await chatRepo.appendTurn({ personaId: drop.id, message: '删掉', reply: '嗯' })

    await personaRepo.remove(drop.id)

    expect(await chatRepo.history({ personaId: keep.id })).toHaveLength(2)
    expect(await chatRepo.history({ personaId: drop.id })).toEqual([])
  })

  it('**发送途中**分身被删掉：回复不会再写进去（那会变成一条没人能到达的记录）', async () => {
    // 模型回复可能要等上一分钟，这期间用户完全可能在另一个标签页里删掉这个分身。
    // 落盘前会重新确认一次，所以这条 appendTurn 应当被拒。
    const persona = await makePersona('刚被删掉的我')
    await personaRepo.remove(persona.id)

    await expect(
      chatRepo.appendTurn({ personaId: persona.id, message: '在吗', reply: '在的' })
    ).rejects.toThrow('分身不存在')

    expect(await chatRepo.loadDialogues()).toHaveLength(0)
  })
})

describe('清空示例也清示例分身名下的对话', () => {
  const SEEDED_AT = new Date(2026, 8, 15, 10, 0, 0)

  it('示例分身和它的对话一起消失', async () => {
    await demoRepo.seedIfNeeded('zh-CN', SEEDED_AT)
    const [persona] = await personaRepo.list()
    expect(persona).toBeTruthy()

    await chatRepo.appendTurn({ personaId: persona.id, message: '在吗', reply: '在的' })
    await demoRepo.clear()

    expect(await personaRepo.list()).toHaveLength(0)
    expect(await chatRepo.history({ personaId: persona.id })).toEqual([])
    // 墓碑留着：备份合并时靠它压住更旧的那一份，免得示例数据被复活
    const raw = await chatRepo.loadDialogues()
    expect(raw).toHaveLength(2)
    expect(raw.every((item) => item.deleted === 1)).toBe(true)
  })

  it('不会碰到用户自己建的对话', async () => {
    await demoRepo.seedIfNeeded('zh-CN', SEEDED_AT)
    const own = await makePersona('我自己建的')
    await chatRepo.appendTurn({ personaId: own.id, message: '留下', reply: '好' })

    await demoRepo.clear()

    expect(await chatRepo.history({ personaId: own.id })).toHaveLength(2)
  })
})

describe('AI 配置', () => {
  it('没配过时是 null', async () => {
    expect(await aiRepo.loadConfig()).toBeNull()
  })

  it('保存后能读回来', async () => {
    await aiRepo.saveConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-abc' })
    const config = await aiRepo.loadConfig()
    expect(config.provider).toBe('deepseek')
    expect(config.model).toBe('deepseek-chat')
    expect(config.apiKey).toBe('sk-abc')
  })

  it('留空的字段沿用已保存的值（页面不回填 Key，靠的就是这条）', async () => {
    await aiRepo.saveConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-abc' })
    // 用户只改了模型，Key 那一栏是空的——不能把已经存好的 Key 抹掉
    const saved = await aiRepo.saveConfig({ provider: 'deepseek', model: 'deepseek-reasoner' })
    expect(saved.apiKey).toBe('sk-abc')
    expect(saved.model).toBe('deepseek-reasoner')
  })

  it('填了新 Key 就覆盖旧的', async () => {
    await aiRepo.saveConfig({ provider: 'deepseek', apiKey: 'sk-old' })
    const saved = await aiRepo.saveConfig({ apiKey: 'sk-new' })
    expect(saved.apiKey).toBe('sk-new')
  })

  it('允许存半成品（先选供应商，回头再申请 Key）', async () => {
    const saved = await aiRepo.saveConfig({ provider: 'openai' })
    expect(saved.provider).toBe('openai')
    expect(saved.apiKey).toBe('')
    expect(await aiRepo.loadConfig()).not.toBeNull()
  })

  it('不认识的供应商被清空，而不是原样存下来', async () => {
    const saved = await aiRepo.saveConfig({ provider: 'https://evil.example.com', apiKey: 'sk-x' })
    expect(saved.provider).toBe('')
  })

  it('resolveConfig 只合成、不落盘（「测试连接」要用它）', async () => {
    await aiRepo.saveConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-saved' })
    const merged = await aiRepo.resolveConfig({ provider: 'openai' })
    expect(merged.provider).toBe('openai')
    expect(merged.apiKey).toBe('sk-saved')
    // 存储里那份没被动过
    expect((await aiRepo.loadConfig()).provider).toBe('deepseek')
  })

  it('清除之后回到 null', async () => {
    await aiRepo.saveConfig({ provider: 'deepseek', apiKey: 'sk-abc' })
    await aiRepo.clearConfig()
    expect(await aiRepo.loadConfig()).toBeNull()
  })
})
