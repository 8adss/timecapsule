/**
 * 备份仓储端到端测试。
 *
 * 覆盖 M2 的三条验收标准：
 * 1. 导出 → 清空 → 导入后数据一致
 * 2. 喂损坏或伪造的文件被拒，**且原数据毫发无损**
 * 3. 快照可回滚
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setAdapter } from '../storage/index.js'
import { createMemoryAdapter } from '../storage/adapters/memory.js'
import * as taskRepo from './taskRepo.js'
import * as capsuleRepo from './capsuleRepo.js'
import * as achievementRepo from './achievementRepo.js'
import * as profileRepo from './profileRepo.js'
import * as knowledgeRepo from './knowledgeRepo.js'
import * as personaRepo from './personaRepo.js'
import * as chatRepo from './chatRepo.js'
import * as aiRepo from './aiRepo.js'
import * as backupRepo from './backupRepo.js'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '../domain/backup.js'
import { ACHIEVEMENT_TYPE, CAPSULE_STATUS, TASK_STATUS } from '../domain/constants.js'

beforeEach(() => {
  setAdapter(createMemoryAdapter())
})

/** 造一份有内容的现状：2 个任务（1 个完成）、1 个胶囊、1 条成就。 */
async function seed() {
  const first = await taskRepo.create({ title: '晨跑' })
  await taskRepo.complete(first.id)
  await taskRepo.create({ title: '读书' })
  const capsule = await capsuleRepo.create({ content: '给未来的话', toDate: '2099-01-01 00:00:00' })
  return { first, capsule }
}

describe('导出', () => {
  it('产出的文件带有格式标识与条数统计', async () => {
    await seed()
    const backup = await backupRepo.createBackup()

    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(backup.counts.tasks).toBe(2)
    expect(backup.counts.capsules).toBe(1)
    expect(backup.data.tasks).toHaveLength(2)
  })

  it('导出的内容能被导入流程接受（真实往返）', async () => {
    await seed()
    const backup = await backupRepo.createBackup()
    // 模拟落盘再读回
    const roundTripped = JSON.parse(JSON.stringify(backup))
    await expect(
      backupRepo.importBackup(roundTripped, backupRepo.IMPORT_MODE.MERGE)
    ).resolves.toBeTruthy()
  })

  it('空数据也能正常导出', async () => {
    const backup = await backupRepo.createBackup()
    expect(backup.data.tasks).toEqual([])
    expect(backup.counts.tasks).toBe(0)
  })
})

describe('导出 → 清空 → 导入，数据一致', () => {
  it('覆盖导入后任务、胶囊、成就、统计全部还原', async () => {
    await seed()
    const before = await backupRepo.readAll()
    const backup = JSON.parse(JSON.stringify(await backupRepo.createBackup()))

    await backupRepo.clearAllData()
    expect(await taskRepo.list()).toHaveLength(0)
    expect(await capsuleRepo.list()).toHaveLength(0)

    await backupRepo.importBackup(backup, backupRepo.IMPORT_MODE.REPLACE)

    const after = await backupRepo.readAll()
    expect(after.tasks).toHaveLength(before.tasks.length)
    expect(after.capsules).toHaveLength(before.capsules.length)
    expect(after.achievements).toHaveLength(before.achievements.length)

    // 任务内容逐字段一致
    const beforeTitles = before.tasks.map((item) => item.title).sort()
    const afterTitles = after.tasks.map((item) => item.title).sort()
    expect(afterTitles).toEqual(beforeTitles)

    // 派生统计也对得上
    expect(after.profile.streakDays).toBe(before.profile.streakDays)
    expect(after.profile.growthLevel).toBe(before.profile.growthLevel)
  })

  it('成就不会因往返而翻倍', async () => {
    await seed()
    const before = await achievementRepo.list()
    const backup = JSON.parse(JSON.stringify(await backupRepo.createBackup()))

    await backupRepo.importBackup(backup, backupRepo.IMPORT_MODE.MERGE)
    const after = await achievementRepo.list()
    expect(after).toHaveLength(before.length)
  })
})

describe('损坏与伪造的文件被拒，且原数据无损', () => {
  /** 记录一份基线，用于在每次失败导入后比对是否被改动。 */
  async function baseline() {
    await seed()
    const raw = await backupRepo.readAll()
    return JSON.parse(JSON.stringify(raw))
  }

  const hostileInputs = [
    ['不是对象', 'this is not json object'],
    ['数组', [1, 2, 3]],
    ['null', null],
    ['空对象', {}],
    ['别的应用的导出文件', { format: 'other-app', formatVersion: 1, data: {} }],
    ['缺少 data', { format: BACKUP_FORMAT, formatVersion: 1 }],
    ['更高的版本号', { format: BACKUP_FORMAT, formatVersion: 99, data: {} }],
    ['原型污染', JSON.parse('{"format":"timecapsule-backup","formatVersion":1,"data":{},"__proto__":{"x":1}}')],
    ['字段类型错误', { format: BACKUP_FORMAT, formatVersion: 1, data: { tasks: [{ id: 'x', title: 1 }] } }],
    ['非法日期', {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      data: {
        tasks: [{
          id: 'x', title: 'x', category: '习惯', description: null, startDate: 'bad',
          dueDate: null, remindTime: null, status: 0, completedAt: null, deleted: 0,
          createdAt: '2026-09-15 10:00:00', updatedAt: '2026-09-15 10:00:00'
        }]
      }
    }],
    ['恶意头像地址', {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      data: {
        profile: {
          id: 'local', nickname: 'x', avatarUrl: 'data:text/html;base64,PHNjcmlwdD4=',
          streakDays: 0, growthLevel: 1,
          createdAt: '2026-09-15 10:00:00', updatedAt: '2026-09-15 10:00:00'
        }
      }
    }]
  ]

  for (const [label, payload] of hostileInputs) {
    it(`拒绝「${label}」并且不改动任何现有数据`, async () => {
      const before = await baseline()

      await expect(
        backupRepo.importBackup(payload, backupRepo.IMPORT_MODE.REPLACE)
      ).rejects.toThrow()

      const after = await backupRepo.readAll()
      expect(after).toEqual(before)

      // 失败的导入不应留下快照（它压根没走到落盘那一步）
      expect(await backupRepo.hasSnapshot()).toBe(false)
    })
  }

  it('拒绝未知的导入模式', async () => {
    const backup = JSON.parse(JSON.stringify(await backupRepo.createBackup()))
    await expect(backupRepo.importBackup(backup, 'destroy')).rejects.toThrow('未知的导入模式')
  })

  it('拒绝含重复 id 的文件，并且不改动现有数据', async () => {
    // 真实来源：用户手工拼的备份，复制粘贴条目时忘了改 id。
    // 若放行，覆盖导入后点一次「完成」会把这几行全部塌成第一条的内容。
    const before = await baseline()
    const duplicated = {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      data: {
        tasks: Array.from({ length: 5 }, (unused, index) => ({
          id: 'dup',
          title: `第${index + 1}条`,
          category: '习惯',
          description: null,
          startDate: '2026-09-15 10:00:00',
          dueDate: null,
          remindTime: null,
          status: 0,
          completedAt: null,
          deleted: 0,
          createdAt: '2026-09-15 10:00:00',
          updatedAt: '2026-09-15 10:00:00'
        }))
      }
    }

    await expect(
      backupRepo.importBackup(duplicated, backupRepo.IMPORT_MODE.REPLACE)
    ).rejects.toThrow('与前面的条目重复')

    expect(await backupRepo.readAll()).toEqual(before)
  })
})

describe('合并与替换的语义差异', () => {
  it('合并保留现有数据并加入新的', async () => {
    await taskRepo.create({ title: '本机任务' })

    const incoming = {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      data: {
        tasks: [{
          id: 'from-backup', title: '备份里的任务', category: '习惯', description: null,
          startDate: '2026-01-01 00:00:00', dueDate: null, remindTime: null,
          status: 0, completedAt: null, deleted: 0,
          createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-01 00:00:00'
        }]
      }
    }

    const result = await backupRepo.importBackup(incoming, backupRepo.IMPORT_MODE.MERGE)
    expect(result.summary.tasksAdded).toBe(1)

    const titles = (await taskRepo.list()).map((item) => item.title).sort()
    expect(titles).toEqual(['备份里的任务', '本机任务'])
  })

  it('覆盖会丢弃备份里没有的数据', async () => {
    await taskRepo.create({ title: '本机任务' })

    const incoming = {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      data: {
        tasks: [{
          id: 'from-backup', title: '备份里的任务', category: '习惯', description: null,
          startDate: '2026-01-01 00:00:00', dueDate: null, remindTime: null,
          status: 0, completedAt: null, deleted: 0,
          createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-01 00:00:00'
        }]
      }
    }

    await backupRepo.importBackup(incoming, backupRepo.IMPORT_MODE.REPLACE)
    const titles = (await taskRepo.list()).map((item) => item.title)
    expect(titles).toEqual(['备份里的任务'])
  })

  it('合并时同 id 冲突取较新的那份', async () => {
    const created = await taskRepo.create({ title: '本机版本' })
    await taskRepo.update(created.id, { title: '本机改过的标题' })

    const incoming = {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      data: {
        tasks: [{
          id: created.id, title: '备份里的旧标题', category: '习惯', description: null,
          startDate: null, dueDate: null, remindTime: null,
          status: 0, completedAt: null, deleted: 0,
          // 明显更早的 updatedAt
          createdAt: '2020-01-01 00:00:00', updatedAt: '2020-01-01 00:00:00'
        }]
      }
    }

    await backupRepo.importBackup(incoming, backupRepo.IMPORT_MODE.MERGE)
    const tasks = await taskRepo.list()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('本机改过的标题')
  })
})

describe('导入后回算派生数据', () => {
  it('只导入任务时，成就里程碑会被补齐', async () => {
    const makeTask = (id, index) => ({
      id, title: `任务${index}`, category: '习惯', description: null,
      startDate: '2026-09-15 10:00:00', dueDate: null, remindTime: null,
      status: TASK_STATUS.DONE, completedAt: '2026-09-15 12:00:00', deleted: 0,
      createdAt: '2026-09-15 10:00:00', updatedAt: '2026-09-15 10:00:00'
    })

    // 3 个已完成任务，但文件里一个成就都没有
    const incoming = {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      data: { tasks: [makeTask('t1', 1), makeTask('t2', 2), makeTask('t3', 3)] }
    }

    await backupRepo.importBackup(incoming, backupRepo.IMPORT_MODE.REPLACE)

    const values = (await achievementRepo.list())
      .filter((item) => item.type === ACHIEVEMENT_TYPE.TASK_DONE)
      .map((item) => item.value)
    expect(values).toEqual([1, 3])

    const profile = await profileRepo.get()
    expect(profile.streakDays).toBeGreaterThan(0)
  })

  it('导入的成就与任务计数一致时不会重复发放', async () => {
    await seed()
    const before = (await achievementRepo.list()).length
    const backup = JSON.parse(JSON.stringify(await backupRepo.createBackup()))

    await backupRepo.importBackup(backup, backupRepo.IMPORT_MODE.MERGE)
    expect((await achievementRepo.list()).length).toBe(before)
  })
})

describe('快照与回滚', () => {
  it('覆盖导入前会自动存快照', async () => {
    await seed()
    expect(await backupRepo.hasSnapshot()).toBe(false)

    const empty = { format: BACKUP_FORMAT, formatVersion: 1, data: { tasks: [] } }
    await backupRepo.importBackup(empty, backupRepo.IMPORT_MODE.REPLACE)

    const snapshot = await backupRepo.readSnapshot()
    expect(snapshot).not.toBeNull()
    expect(snapshot.reason).toBe('import:replace')
    expect(snapshot.data.tasks).toHaveLength(2)
  })

  it('回滚能把覆盖导入前的数据找回来', async () => {
    await seed()
    const empty = { format: BACKUP_FORMAT, formatVersion: 1, data: { tasks: [] } }
    await backupRepo.importBackup(empty, backupRepo.IMPORT_MODE.REPLACE)
    expect(await taskRepo.list()).toHaveLength(0)

    await backupRepo.restoreSnapshot()

    const titles = (await taskRepo.list()).map((item) => item.title).sort()
    expect(titles).toEqual(['晨跑', '读书'])
    expect(await capsuleRepo.list()).toHaveLength(1)
  })

  it('回滚本身也会先存快照，所以可以再滚回来', async () => {
    await seed()
    const empty = { format: BACKUP_FORMAT, formatVersion: 1, data: { tasks: [] } }
    await backupRepo.importBackup(empty, backupRepo.IMPORT_MODE.REPLACE)
    await backupRepo.restoreSnapshot()
    expect(await taskRepo.list()).toHaveLength(2)

    // 再回滚一次，应当回到「已清空」的那一步
    await backupRepo.restoreSnapshot()
    expect(await taskRepo.list()).toHaveLength(0)
  })

  it('清空数据前会自动存快照，且可以回滚', async () => {
    await seed()
    await backupRepo.clearAllData()

    expect(await taskRepo.list()).toHaveLength(0)
    expect(await capsuleRepo.list()).toHaveLength(0)
    expect(await achievementRepo.list()).toHaveLength(0)

    const snapshot = await backupRepo.readSnapshot()
    expect(snapshot.reason).toBe('clear')

    await backupRepo.restoreSnapshot()
    expect(await taskRepo.list()).toHaveLength(2)
  })

  it('没有快照时回滚报错而不是清空数据', async () => {
    await seed()
    await expect(backupRepo.restoreSnapshot()).rejects.toThrow('没有可恢复的快照')
    expect(await taskRepo.list()).toHaveLength(2)
  })

  it('丢弃快照后无法回滚', async () => {
    await seed()
    await backupRepo.clearAllData()
    await backupRepo.discardSnapshot()
    await expect(backupRepo.restoreSnapshot()).rejects.toThrow('没有可恢复的快照')
  })
})

describe('清空后的状态是干净的', () => {
  it('清空会重置画像但保留档案本身', async () => {
    await seed()
    await backupRepo.clearAllData()

    const profile = await profileRepo.get()
    expect(profile.streakDays).toBe(0)
    expect(profile.growthLevel).toBe(1)
    // 昵称与头像属于「设置」而非「记录」，清空数据不该把人设也抹了
    expect(profile.nickname).toBeTruthy()
  })

  it('清空后胶囊状态与成就都归零', async () => {
    await seed()
    await backupRepo.clearAllData()
    expect(await capsuleRepo.listOpened()).toHaveLength(0)
    expect(await achievementRepo.list()).toHaveLength(0)
  })
})

describe('知识库与分身也在备份范围内', () => {
  // 这两个集合是后加的，而 backupRepo 里的键列表是**硬编码**的
  // （不是遍历 DATA_KEYS，见该文件里的说明）。漏掉任何一处，
  // 用户导出备份时都会静默少一个集合——而它们恰恰是最舍不得丢的那份数据：
  // 自己写的日记与自我介绍，以及手写了几百字的画像。
  const ownDoc = { title: '关于我', content: '我是一名后端工程师', sourceType: 'PASTE' }
  const ownPersona = (docIds) => ({
    name: '那时的我',
    selfDate: '2026-09-01',
    docIds,
    summary: '画像',
    stylePrompt: '说话风格'
  })

  it('导出时带上两个集合与条数', async () => {
    const created = await knowledgeRepo.create(ownDoc)
    await personaRepo.create(ownPersona([created.id]))

    const backup = await backupRepo.createBackup()
    expect(backup.counts.knowledge).toBe(1)
    expect(backup.counts.personas).toBe(1)
    expect(backup.data.knowledge).toHaveLength(1)
    expect(backup.data.personas).toHaveLength(1)
  })

  it('导出 → 清空 → 导入后都还在', async () => {
    const created = await knowledgeRepo.create(ownDoc)
    await personaRepo.create(ownPersona([created.id]))

    const backup = await backupRepo.createBackup()
    await backupRepo.clearAllData()
    expect(await knowledgeRepo.list()).toHaveLength(0)
    expect(await personaRepo.list()).toHaveLength(0)

    await backupRepo.importBackup(JSON.parse(JSON.stringify(backup)), backupRepo.IMPORT_MODE.REPLACE)

    const docs = await knowledgeRepo.list()
    expect(docs).toHaveLength(1)
    expect(docs[0].title).toBe('关于我')
    expect(await personaRepo.list()).toHaveLength(1)
  })

  it('清空数据会把两个集合一起清掉', async () => {
    const created = await knowledgeRepo.create(ownDoc)
    await personaRepo.create(ownPersona([created.id]))

    await backupRepo.clearAllData()

    expect(await knowledgeRepo.list()).toHaveLength(0)
    expect(await personaRepo.list()).toHaveLength(0)
  })

  it('回滚能把清空前的两个集合找回来', async () => {
    const created = await knowledgeRepo.create(ownDoc)
    await personaRepo.create(ownPersona([created.id]))

    await backupRepo.clearAllData()
    await backupRepo.restoreSnapshot()

    expect(await knowledgeRepo.list()).toHaveLength(1)
    expect(await personaRepo.list()).toHaveLength(1)
  })

  it('替换导入一份没有这两个集合的老备份时，它们被清空而不是留下残渣', async () => {
    // 「替换」的语义是导入什么就是什么。若只覆盖文件里出现过的键，
    // 用户以为换成了新设备的数据，实际还留着上一份的旧文档。
    // 这一步是安全的：操作前会自动存快照，随时能滚回来（上一条用例就是它）。
    await knowledgeRepo.create(ownDoc)

    const old = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: '2026-09-15T10:00:00.000Z',
      data: { profile: null, tasks: [], capsules: [], achievements: [], settings: {} }
    }
    await backupRepo.importBackup(old, backupRepo.IMPORT_MODE.REPLACE)

    expect(await knowledgeRepo.list()).toHaveLength(0)
    expect(await personaRepo.list()).toHaveLength(0)
  })
})

describe('对话记录进备份，AI 配置不进', () => {
  const doc = { title: '关于我', content: '我喜欢在清晨跑步', sourceType: 'PASTE' }

  /** 造一次真实的对话：一篇材料 + 一个分身 + 一轮对话（胶囊那边也来一轮）。 */
  async function seedChat() {
    const created = await knowledgeRepo.create(doc)
    const persona = await personaRepo.create({
      name: '那时的我',
      selfDate: '2026-09-01',
      docIds: [created.id]
    })
    await chatRepo.appendTurn({ personaId: persona.id, message: '在吗', reply: '在的' })
    await chatRepo.appendTurn({ capsuleId: 'c-legacy', message: '我跑完了', reply: '真好' })
    await aiRepo.saveConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-secret' })
    return persona
  }

  it('导出时带上对话与条数', async () => {
    await seedChat()

    const backup = await backupRepo.createBackup()
    expect(backup.counts.dialogues).toBe(4)
    expect(backup.data.dialogues).toHaveLength(4)
  })

  it('导出 → 清空 → 导入后对话还在', async () => {
    const persona = await seedChat()

    const backup = await backupRepo.createBackup()
    await backupRepo.clearAllData()
    expect(await chatRepo.loadDialogues()).toHaveLength(0)

    await backupRepo.importBackup(JSON.parse(JSON.stringify(backup)), backupRepo.IMPORT_MODE.REPLACE)

    expect(await chatRepo.history({ personaId: persona.id })).toHaveLength(2)
    expect(await chatRepo.history({ capsuleId: 'c-legacy' })).toHaveLength(2)
  })

  it('回滚能把清空前的对话找回来', async () => {
    await seedChat()

    await backupRepo.clearAllData()
    await backupRepo.restoreSnapshot()

    expect(await chatRepo.loadDialogues()).toHaveLength(4)
  })

  it('**API Key 不在备份文件里**（备份是会被拷来拷去、发给别人的东西）', async () => {
    await seedChat()

    const backup = await backupRepo.createBackup()
    const text = JSON.stringify(backup)

    expect(backup.data.aiConfig).toBeUndefined()
    expect(text).not.toContain('sk-secret')
    // 也不是「键还在、只是空着」——整个键就不该出现
    expect(text).not.toContain('aiConfig')
  })

  it('清空数据**不动** AI 配置：它是凭据不是数据，且快照里没有它', async () => {
    await aiRepo.saveConfig({ provider: 'deepseek', apiKey: 'sk-secret' })
    await backupRepo.clearAllData()

    // 清掉的话就回滚不回来了（快照存的是 readAll() 的结果，不含 aiConfig），
    // 而对话框上写着「操作前会自动保存快照，之后可以回滚」。
    // 要删 Key，设置页有明确的「清除配置」按钮。
    const config = await aiRepo.loadConfig()
    expect(config.apiKey).toBe('sk-secret')
  })
})
