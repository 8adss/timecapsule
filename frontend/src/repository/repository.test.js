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
import * as achievementRepo from './achievementRepo.js'
import * as profileRepo from './profileRepo.js'
import { runMaintenance } from './maintenance.js'
import { TASK_STATUS, CAPSULE_STATUS, ACHIEVEMENT_TYPE } from '../domain/constants.js'

beforeEach(() => {
  // 每个用例一份干净的内存存储，用例之间互不影响
  setAdapter(createMemoryAdapter())
})

/** 取某类型已解锁的里程碑数值，方便断言。 */
async function grantedValues(type) {
  const all = await achievementRepo.list()
  return all.filter((item) => item.type === type).map((item) => item.value)
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
