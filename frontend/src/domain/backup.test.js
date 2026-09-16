import { describe, it, expect } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  buildBackup,
  mergeData,
  replaceData,
  validateBackup
} from './backup.js'

/** 造一条合法任务，用 over 覆盖单个字段来构造非法用例。 */
const task = (over = {}) => ({
  id: 't1',
  title: '晨跑',
  category: '习惯',
  description: null,
  startDate: '2026-09-15 10:00:00',
  dueDate: null,
  remindTime: null,
  status: 0,
  completedAt: null,
  deleted: 0,
  createdAt: '2026-09-15 10:00:00',
  updatedAt: '2026-09-15 10:00:00',
  ...over
})

const capsule = (over = {}) => ({
  id: 'c1',
  taskId: null,
  toDate: '2099-01-01 00:00:00',
  content: '你好，未来的我',
  voiceUrl: null,
  status: 0,
  openedAt: null,
  deleted: 0,
  createdAt: '2026-09-15 10:00:00',
  updatedAt: '2026-09-15 10:00:00',
  ...over
})

const achievement = (over = {}) => ({
  id: 'a1',
  type: '任务完成',
  value: 1,
  unlockedAt: '2026-09-15 10:00:00',
  ...over
})

/** 造一篇合法的知识库文档。 */
const doc = (over = {}) => ({
  id: 'k1',
  title: '关于我',
  content: '我是一名后端工程师',
  sourceType: 'PASTE',
  originName: null,
  deleted: 0,
  createdAt: '2026-09-15 10:00:00',
  updatedAt: '2026-09-15 10:00:00',
  ...over
})

/** 组装一份结构完整的备份文件。 */
const backup = (data = {}) => ({
  format: BACKUP_FORMAT,
  formatVersion: BACKUP_FORMAT_VERSION,
  exportedAt: '2026-09-15T10:00:00.000Z',
  data: { profile: null, tasks: [], capsules: [], achievements: [], settings: {}, ...data }
})

describe('buildBackup', () => {
  it('带上格式标识与版本号', () => {
    const result = buildBackup({ tasks: [task()] }, new Date('2026-09-15T10:00:00Z'))
    expect(result.format).toBe(BACKUP_FORMAT)
    expect(result.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(result.exportedAt).toBe('2026-09-15T10:00:00.000Z')
  })

  it('缺失的集合补成空值而不是 undefined', () => {
    const result = buildBackup({})
    expect(result.data.tasks).toEqual([])
    expect(result.data.capsules).toEqual([])
    expect(result.data.achievements).toEqual([])
    expect(result.data.settings).toEqual({})
    expect(result.data.profile).toBeNull()
  })

  it('产出的文件能被自己校验通过（往返一致）', () => {
    const built = buildBackup({ tasks: [task()], capsules: [capsule()], achievements: [achievement()] })
    // 经过一次真实的 JSON 序列化/反序列化，模拟落盘再读回
    const roundTripped = JSON.parse(JSON.stringify(built))
    const { data } = validateBackup(roundTripped)
    expect(data.tasks).toHaveLength(1)
    expect(data.tasks[0].title).toBe('晨跑')
    expect(data.capsules).toHaveLength(1)
    expect(data.achievements).toHaveLength(1)
  })
})

describe('validateBackup 的结构校验', () => {
  it('接受一份合法文件', () => {
    expect(() => validateBackup(backup({ tasks: [task()] }))).not.toThrow()
  })

  it('拒绝非对象', () => {
    expect(() => validateBackup(null)).toThrow('不是一个对象')
    expect(() => validateBackup([])).toThrow('不是一个对象')
    expect(() => validateBackup('{}')).toThrow('不是一个对象')
    expect(() => validateBackup(42)).toThrow('不是一个对象')
  })

  it('拒绝别的应用的 JSON', () => {
    expect(() => validateBackup({ format: 'something-else', formatVersion: 1, data: {} }))
      .toThrow('不是本应用的备份文件')
  })

  it('拒绝缺少或非法的版本号', () => {
    expect(() => validateBackup({ ...backup(), formatVersion: undefined })).toThrow('缺少合法的 formatVersion')
    expect(() => validateBackup({ ...backup(), formatVersion: '1' })).toThrow('缺少合法的 formatVersion')
    expect(() => validateBackup({ ...backup(), formatVersion: 0 })).toThrow('缺少合法的 formatVersion')
  })

  it('拒绝来自更高版本的文件，并提示升级', () => {
    expect(() => validateBackup({ ...backup(), formatVersion: BACKUP_FORMAT_VERSION + 1 }))
      .toThrow('高于当前应用支持的')
  })

  it('拒绝缺少 data 的文件', () => {
    expect(() => validateBackup({ format: BACKUP_FORMAT, formatVersion: 1 })).toThrow('缺少 data 字段')
  })
})

describe('validateBackup 的安全防线', () => {
  it('拒绝携带 __proto__ 键的文件（原型污染）', () => {
    // JSON.parse 会把 __proto__ 变成普通自有属性，朴素的合并写法
    // （Object.assign / 展开）会触发 setter 从而污染 Object.prototype。
    const hostile = JSON.parse('{"format":"timecapsule-backup","formatVersion":1,"data":{},"__proto__":{"polluted":true}}')
    expect(() => validateBackup(hostile)).toThrow('非法键名')
    // 确认全局没有被污染
    expect({}.polluted).toBeUndefined()
  })

  it('拒绝污染尝试后 Object.prototype 仍然干净', () => {
    const hostile = JSON.parse(
      '{"format":"timecapsule-backup","formatVersion":1,"data":{"settings":{"__proto__":{"x":1}}}}'
    )
    expect(() => validateBackup(hostile)).toThrow()
    expect({}.x).toBeUndefined()
  })

  it('清洗结果里不含输入对象上的未知字段（白名单，不是黑名单）', () => {
    const { data } = validateBackup(backup({
      tasks: [task({ evil: 'payload', isAdmin: true })]
    }))
    expect(data.tasks[0]).not.toHaveProperty('evil')
    expect(data.tasks[0]).not.toHaveProperty('isAdmin')
    // 只应有业务字段
    expect(Object.keys(data.tasks[0]).sort()).toEqual([
      'category', 'completedAt', 'createdAt', 'deleted', 'description',
      'dueDate', 'id', 'remindTime', 'startDate', 'status', 'title', 'updatedAt'
    ])
  })

  it('头像地址只接受图片 dataURL 与 http(s) 链接', () => {
    const cases = [
      ['data:image/png;base64,iVBORw0KGgo=', true],
      ['data:image/webp;base64,UklGRh4=', true],
      ['https://example.com/a.png', true],
      ['http://example.com/a.png', true],
      // SVG 可以内嵌脚本，必须拒绝
      ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', false],
      ['data:text/html;base64,PHNjcmlwdD4=', false],
      ['javascript:alert(1)', false],
      ['vbscript:msgbox(1)', false],
      ['file:///etc/passwd', false]
    ]
    for (const [value, ok] of cases) {
      const run = () => validateBackup(backup({
        profile: {
          id: 'local', nickname: 'x', avatarUrl: value,
          streakDays: 0, growthLevel: 1,
          createdAt: '2026-09-15 10:00:00', updatedAt: '2026-09-15 10:00:00'
        }
      }))
      if (ok) {
        expect(run, `${value} 应被接受`).not.toThrow()
      } else {
        expect(run, `${value} 应被拒绝`).toThrow('不是受支持的图片地址')
      }
    }
  })
})

describe('validateBackup 的字段校验', () => {
  it('拒绝非法的日期时间格式', () => {
    expect(() => validateBackup(backup({ tasks: [task({ startDate: '2026/09/15' })] })))
      .toThrow('不是合法的 yyyy-MM-dd HH:mm:ss 时间')
    expect(() => validateBackup(backup({ tasks: [task({ startDate: '<script>' })] }))).toThrow('不是合法')
  })

  it('拒绝非法的任务状态', () => {
    expect(() => validateBackup(backup({ tasks: [task({ status: 99 })] }))).toThrow('取值非法')
    expect(() => validateBackup(backup({ tasks: [task({ status: '0' })] }))).toThrow('取值非法')
  })

  it('拒绝非法的成就类型', () => {
    expect(() => validateBackup(backup({ achievements: [achievement({ type: '管理员' })] })))
      .toThrow('取值非法')
  })

  it('拒绝超出长度上限的字段', () => {
    expect(() => validateBackup(backup({ tasks: [task({ title: 'x'.repeat(101) })] })))
      .toThrow('超出上限')
    expect(() => validateBackup(backup({ tasks: [task({ description: 'x'.repeat(501) })] })))
      .toThrow('超出上限')
  })

  it('拒绝缺失必填时间的任务', () => {
    expect(() => validateBackup(backup({ tasks: [task({ createdAt: null })] }))).toThrow('缺失')
  })

  it('拒绝类型错误的字段', () => {
    expect(() => validateBackup(backup({ tasks: [task({ title: 123 })] }))).toThrow('应为字符串')
    // id 走的是更严格的 checkId，文案与普通字符串字段不同
    expect(() => validateBackup(backup({ tasks: [task({ id: {} })] }))).toThrow('缺失或为空')
  })

  it('拒绝把集合写成非数组', () => {
    expect(() => validateBackup(backup({ tasks: { a: 1 } }))).toThrow('应为数组')
  })

  it('设置项只接受标量值', () => {
    expect(() => validateBackup(backup({ settings: { theme: 'dark' } }))).not.toThrow()
    expect(() => validateBackup(backup({ settings: { nested: { a: 1 } } })))
      .toThrow('值类型不受支持')
    expect(() => validateBackup(backup({ settings: { list: [1, 2] } })))
      .toThrow('值类型不受支持')
  })

  it('一次报多处问题时只展示前三条并给出总数', () => {
    // 每条给不同的 id：否则会先撞上「id 重复」的校验，掩盖这里要测的多错误汇总
    const broken = backup({
      tasks: [
        task({ id: 'b1', title: 1 }),
        task({ id: 'b2', status: 9 }),
        task({ id: 'b3', dueDate: 'bad' }),
        task({ id: 'b4', description: 5 })
      ]
    })
    expect(() => validateBackup(broken)).toThrow('另有 1 处问题')
  })

  it('错误信息里带出具体位置的路径', () => {
    expect(() => validateBackup(backup({
      tasks: [task({ id: 'p1' }), task({ id: 'p2', title: 'ok' }), task({ id: 'p3', title: 7 })]
    }))).toThrow('data.tasks[2].title')
  })
})

describe('validateBackup 的主键校验', () => {
  it('拒绝空 id', () => {
    expect(() => validateBackup(backup({ tasks: [task({ id: '' })] }))).toThrow('缺失或为空')
    expect(() => validateBackup(backup({ tasks: [task({ id: '   ' })] }))).toThrow('缺失或为空')
    expect(() => validateBackup(backup({ tasks: [task({ id: undefined })] }))).toThrow('缺失或为空')
  })

  it('拒绝重复的任务 id', () => {
    // 下游一律用 `list.map(item => item.id === id ? next : item)` 定位，
    // id 不唯一时一次操作会改掉多行。必须整份拒绝。
    expect(() => validateBackup(backup({
      tasks: [task({ id: 'dup', title: '第一条' }), task({ id: 'dup', title: '第二条' })]
    }))).toThrow('与前面的条目重复')
  })

  it('拒绝重复的胶囊 id', () => {
    expect(() => validateBackup(backup({
      capsules: [capsule({ id: 'dup' }), capsule({ id: 'dup' })]
    }))).toThrow('与前面的条目重复')
  })

  it('拒绝重复的成就 id', () => {
    expect(() => validateBackup(backup({
      achievements: [achievement({ id: 'dup', value: 1 }), achievement({ id: 'dup', value: 3 })]
    }))).toThrow('与前面的条目重复')
  })

  it('不同集合之间可以重名（各自独立编号）', () => {
    expect(() => validateBackup(backup({
      tasks: [task({ id: 'same' })],
      capsules: [capsule({ id: 'same' })]
    }))).not.toThrow()
  })

  it('重复 id 的错误信息里带出具体位置', () => {
    expect(() => validateBackup(backup({
      tasks: [task({ id: 'dup' }), task({ id: 'dup' })]
    }))).toThrow('data.tasks[1].id')
  })
})

describe('mergeData', () => {
  const current = { profile: null, tasks: [task()], capsules: [], achievements: [], settings: {} }

  it('按 id 去重，新增不存在的条目', () => {
    const incoming = { tasks: [task({ id: 't2', title: '夜跑' })] }
    const { data, summary } = mergeData(current, incoming)
    expect(data.tasks).toHaveLength(2)
    expect(summary.tasksAdded).toBe(1)
  })

  it('同 id 冲突时取 updatedAt 较新的', () => {
    const newer = task({ title: '新标题', updatedAt: '2026-12-01 00:00:00' })
    const { data } = mergeData(current, { tasks: [newer] })
    expect(data.tasks[0].title).toBe('新标题')

    const older = task({ title: '旧标题', updatedAt: '2026-01-01 00:00:00' })
    const { data: kept } = mergeData(current, { tasks: [older] })
    expect(kept.tasks[0].title).toBe('晨跑')
  })

  it('成就不按 id 去重，而按「类型 + 数值」', () => {
    // 两台设备各自解锁同一个里程碑时 id 不同、语义相同，必须合并成一条
    const existing = { achievements: [achievement({ id: 'device-a', type: '任务完成', value: 1 })] }
    const incoming = { achievements: [achievement({ id: 'device-b', type: '任务完成', value: 1 })] }
    const { data, summary } = mergeData(existing, incoming)
    expect(data.achievements).toHaveLength(1)
    expect(summary.achievementsAdded).toBe(0)
  })

  it('不同数值的成就分别保留', () => {
    const existing = { achievements: [achievement({ id: 'a', value: 1 })] }
    const incoming = { achievements: [achievement({ id: 'b', value: 3 })] }
    const { data } = mergeData(existing, incoming)
    expect(data.achievements.map((item) => item.value).sort()).toEqual([1, 3])
  })

  it('画像取 updatedAt 较新的那份', () => {
    const older = { nickname: '旧的', updatedAt: '2026-01-01 00:00:00' }
    const newer = { nickname: '新的', updatedAt: '2026-12-01 00:00:00' }
    expect(mergeData({ profile: older }, { profile: newer }).data.profile.nickname).toBe('新的')
    expect(mergeData({ profile: newer }, { profile: older }).data.profile.nickname).toBe('新的')
    expect(mergeData({ profile: null }, { profile: newer }).data.profile.nickname).toBe('新的')
  })

  it('不修改传入的数组', () => {
    const original = [task()]
    const snapshot = JSON.parse(JSON.stringify(original))
    mergeData({ tasks: original }, { tasks: [task({ id: 't2' })] })
    expect(original).toEqual(snapshot)
  })
})

describe('replaceData', () => {
  it('缺失的集合被清空，而不是保留旧数据', () => {
    // 「替换」的语义是导入什么就是什么。若只覆盖文件里出现过的键，
    // 用户以为清空了，实际还留着上一份数据的残渣。
    const { data } = replaceData({ tasks: [task()] })
    expect(data.tasks).toHaveLength(1)
    expect(data.capsules).toEqual([])
    expect(data.achievements).toEqual([])
    expect(data.profile).toBeNull()
  })

  it('统计值反映导入的条目数', () => {
    const { summary } = replaceData({ tasks: [task(), task({ id: 't2' })], capsules: [capsule()] })
    expect(summary.tasksAdded).toBe(2)
    expect(summary.capsulesAdded).toBe(1)
  })
})

describe('知识库（后加的集合）', () => {
  it('导出时带上知识库与条数', () => {
    const result = buildBackup({ knowledge: [doc()] })
    expect(result.data.knowledge).toHaveLength(1)
    expect(result.counts.knowledge).toBe(1)
  })

  it('缺失时补成空数组，而不是 undefined', () => {
    expect(buildBackup({}).data.knowledge).toEqual([])
    expect(buildBackup({}).counts.knowledge).toBe(0)
  })

  it('老备份（data 里没有 knowledge）照样能导入', () => {
    // 这条是整个设计的关键：知识库上线**之前**导出的备份文件不能被判成损坏。
    // 新增一个集合对旧文件是向后兼容的，所以 BACKUP_FORMAT_VERSION 不必升。
    const { data } = validateBackup(backup())
    expect(data.knowledge).toEqual([])
  })

  it('接受一篇合法文档', () => {
    const { data } = validateBackup(backup({ knowledge: [doc()] }))
    expect(data.knowledge[0].title).toBe('关于我')
  })

  it('拒绝非法的来源取值', () => {
    expect(() => validateBackup(backup({ knowledge: [doc({ sourceType: 'PDF' })] })))
      .toThrow('data.knowledge[0].sourceType')
  })

  it('拒绝缺少创建时间', () => {
    expect(() => validateBackup(backup({ knowledge: [doc({ createdAt: null })] })))
      .toThrow('data.knowledge[0].createdAt')
  })

  it('拒绝超长标题', () => {
    expect(() => validateBackup(backup({ knowledge: [doc({ title: 'x'.repeat(201) })] })))
      .toThrow('超出上限')
  })

  it('派生字段（字数与摘要）不进导入结果', () => {
    // 本地实现不存这两个值——它们是正文的函数。旧文件里夹带也不该被接纳，
    // 否则会出现「正文 100 字、字数写着 999」这种自相矛盾的数据。
    const { data } = validateBackup(backup({ knowledge: [doc({ charCount: 999, preview: '假的' })] }))
    expect(data.knowledge[0]).not.toHaveProperty('charCount')
    expect(data.knowledge[0]).not.toHaveProperty('preview')
  })

  it('拒绝重复的文档 id', () => {
    expect(() => validateBackup(backup({ knowledge: [doc(), doc()] })))
      .toThrow('与前面的条目重复')
  })

  it('合并：新增本地没有的文档', () => {
    const { data, summary } = mergeData({ knowledge: [] }, { knowledge: [doc()] })
    expect(data.knowledge).toHaveLength(1)
    expect(summary.knowledgeAdded).toBe(1)
  })

  it('合并：同 id 取 updatedAt 较新的那份', () => {
    const mine = doc({ title: '旧标题' })
    const theirs = doc({ title: '新标题', updatedAt: '2026-12-01 00:00:00' })
    expect(mergeData({ knowledge: [mine] }, { knowledge: [theirs] }).data.knowledge[0].title)
      .toBe('新标题')
  })

  it('合并：本机删掉的文档不会被旧备份复活', () => {
    // 这就是用逻辑删除而不是直接从数组里抹掉的原因：
    // 墓碑的 updatedAt 更新，合并时胜出，用户不会看到「删掉的资料又回来了」。
    const tombstone = doc({ deleted: 1, updatedAt: '2026-12-01 00:00:00' })
    const alive = doc({ updatedAt: '2026-09-15 10:00:00' })
    const { data } = mergeData({ knowledge: [tombstone] }, { knowledge: [alive] })
    expect(data.knowledge[0].deleted).toBe(1)
  })

  it('替换：带上导入的文档，缺失时清空', () => {
    expect(replaceData({ knowledge: [doc()] }).data.knowledge).toHaveLength(1)
    expect(replaceData({ knowledge: [doc()] }).summary.knowledgeAdded).toBe(1)
    // 「替换」的语义是导入什么就是什么，与其它集合一致
    expect(replaceData({}).data.knowledge).toEqual([])
  })
})

describe('分身（更晚加的集合）', () => {
  const persona = (over = {}) => ({
    id: 'p1',
    name: '那时的我',
    selfDate: '2026-09-01',
    docIds: ['d1'],
    summary: '画像',
    stylePrompt: '说话风格',
    status: 'READY',
    failReason: null,
    model: null,
    deleted: 0,
    createdAt: '2026-09-15 10:00:00',
    updatedAt: '2026-09-15 10:00:00',
    ...over
  })

  it('导出时带上分身与条数', () => {
    const result = buildBackup({ personas: [persona()] })
    expect(result.data.personas).toHaveLength(1)
    expect(result.counts.personas).toBe(1)
  })

  it('缺失时补成空数组，而不是 undefined', () => {
    expect(buildBackup({}).data.personas).toEqual([])
    expect(buildBackup({}).counts.personas).toBe(0)
  })

  it('老备份（data 里没有 personas）照样能导入', () => {
    // 与知识库同理：新增一个集合对旧文件是向后兼容的，formatVersion 不必升
    expect(validateBackup(backup()).data.personas).toEqual([])
  })

  it('接受一个合法分身', () => {
    const { data } = validateBackup(backup({ personas: [persona()] }))
    expect(data.personas[0].name).toBe('那时的我')
    expect(data.personas[0].status).toBe('READY')
  })

  it('拒绝非法的状态取值', () => {
    expect(() => validateBackup(backup({ personas: [persona({ status: 'DONE' })] })))
      .toThrow('data.personas[0].status')
  })

  it('拒绝缺失或格式不对的代表时间点', () => {
    // 必须是纯日期：带上时分秒说明这份文件不是本应用产出的
    expect(() => validateBackup(backup({ personas: [persona({ selfDate: null })] })))
      .toThrow('data.personas[0].selfDate')
    expect(() => validateBackup(backup({ personas: [persona({ selfDate: '2026-09-01 00:00:00' })] })))
      .toThrow('不是合法的 yyyy-MM-dd 日期')
  })

  it('拒绝引用的材料不是数组', () => {
    expect(() => validateBackup(backup({ personas: [persona({ docIds: 'd1' })] })))
      .toThrow('data.personas[0].docIds 应为数组')
  })

  it('引用为空数组时拒绝（没有材料来源的分身不成立）', () => {
    expect(() => validateBackup(backup({ personas: [persona({ docIds: [] })] })))
      .toThrow('data.personas[0].docIds')
  })

  it('引用的材料被去重', () => {
    const { data } = validateBackup(backup({ personas: [persona({ docIds: ['d1', 'd2', 'd1'] })] }))
    expect(data.personas[0].docIds).toEqual(['d1', 'd2'])
  })

  it('拒绝超长名称', () => {
    expect(() => validateBackup(backup({ personas: [persona({ name: 'x'.repeat(101) })] })))
      .toThrow('超出上限')
  })

  it('画像与说话风格缺失时统一成空串（实体里用的就是空串）', () => {
    const { data } = validateBackup(backup({ personas: [persona({ summary: null, stylePrompt: undefined })] }))
    expect(data.personas[0].summary).toBe('')
    expect(data.personas[0].stylePrompt).toBe('')
  })

  it('派生字段（材料数）不进导入结果', () => {
    const { data } = validateBackup(backup({ personas: [persona({ docCount: 99 })] }))
    expect(data.personas[0]).not.toHaveProperty('docCount')
  })

  it('拒绝重复的分身 id', () => {
    expect(() => validateBackup(backup({ personas: [persona(), persona()] })))
      .toThrow('与前面的条目重复')
  })

  it('合并：新增本地没有的分身', () => {
    const { data, summary } = mergeData({ personas: [] }, { personas: [persona()] })
    expect(data.personas).toHaveLength(1)
    expect(summary.personasAdded).toBe(1)
  })

  it('合并：同 id 取 updatedAt 较新的那份', () => {
    const mine = persona({ name: '旧画像' })
    const theirs = persona({ name: '新画像', updatedAt: '2026-12-01 00:00:00' })
    expect(mergeData({ personas: [mine] }, { personas: [theirs] }).data.personas[0].name)
      .toBe('新画像')
  })

  it('合并：本机删掉的分身不会被旧备份复活', () => {
    const tombstone = persona({ deleted: 1, updatedAt: '2026-12-01 00:00:00' })
    const alive = persona({ updatedAt: '2026-09-15 10:00:00' })
    expect(mergeData({ personas: [tombstone] }, { personas: [alive] }).data.personas[0].deleted).toBe(1)
  })

  it('合并时不校验引用的材料是否真的存在', () => {
    // 被引用的文档可能已经被删掉了，那是正常状态（界面上显示「材料已删除」），
    // 不该因为一份「引用已失效」的备份就让整次导入失败
    const incoming = { personas: [persona({ docIds: ['早已不存在的文档'] })] }
    expect(() => mergeData({ personas: [] }, incoming)).not.toThrow()
  })

  it('替换：带上导入的分身，缺失时清空', () => {
    expect(replaceData({ personas: [persona()] }).data.personas).toHaveLength(1)
    expect(replaceData({ personas: [persona()] }).summary.personasAdded).toBe(1)
    expect(replaceData({}).data.personas).toEqual([])
  })
})
