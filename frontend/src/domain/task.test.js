import { describe, it, expect } from 'vitest'
import {
  abandonTask,
  applyTaskPatch,
  buildTask,
  completeTask,
  markOverdue,
  overdueTaskIds,
  sortTasks,
  visibleTasks
} from './task.js'
import { TASK_STATUS } from './constants.js'

const NOW = new Date(2026, 8, 15, 10, 0, 0) // 2026-09-15 10:00:00

describe('buildTask', () => {
  it('填入默认值：类别「习惯」、状态进行中、开始时间取当下', () => {
    const task = buildTask({ title: '晨跑' }, NOW)
    expect(task.category).toBe('习惯')
    expect(task.status).toBe(TASK_STATUS.ONGOING)
    expect(task.startDate).toBe('2026-09-15 10:00:00')
    expect(task.completedAt).toBeNull()
    expect(task.deleted).toBe(0)
    expect(task.createdAt).toBe('2026-09-15 10:00:00')
  })

  it('标题两端空白被去掉', () => {
    expect(buildTask({ title: '  晨跑  ' }, NOW).title).toBe('晨跑')
  })

  it('标题为空时抛错', () => {
    expect(() => buildTask({ title: '' }, NOW)).toThrow('请填写任务名称')
    expect(() => buildTask({ title: '   ' }, NOW)).toThrow('请填写任务名称')
    expect(() => buildTask({}, NOW)).toThrow('请填写任务名称')
  })

  it('每条任务拿到不同的 id', () => {
    const a = buildTask({ title: 'A' }, NOW)
    const b = buildTask({ title: 'B' }, NOW)
    expect(a.id).not.toBe(b.id)
  })
})

describe('applyTaskPatch', () => {
  const base = buildTask({ title: '晨跑', category: '健身' }, NOW)

  it('可以改标题与描述', () => {
    const next = applyTaskPatch(base, { title: '夜跑', description: '五公里' }, NOW)
    expect(next.title).toBe('夜跑')
    expect(next.description).toBe('五公里')
  })

  it('标题传空字符串时保持原值（空 = 没填，不是清空）', () => {
    expect(applyTaskPatch(base, { title: '' }, NOW).title).toBe('晨跑')
    expect(applyTaskPatch(base, { title: '   ' }, NOW).title).toBe('晨跑')
  })

  it('未出现在 patch 里的字段不受影响', () => {
    const next = applyTaskPatch(base, { description: '五公里' }, NOW)
    expect(next.title).toBe('晨跑')
    expect(next.category).toBe('健身')
  })

  it('传 null 会真的清空截止时间（与后端的有意差异，勿改回一致）', () => {
    // 后端走 MyBatis-Plus 的 NOT_NULL 更新策略，null 字段被跳过，
    // 导致用户在界面上清不掉截止时间。本地实现没有照抄这个缺陷。
    // 若有人为了「与后端等价」把它改回去，这条用例会失败并指向上面的说明。
    const withDue = { ...base, dueDate: '2026-10-01 00:00:00', remindTime: '2026-10-01 09:00:00' }
    const next = applyTaskPatch(withDue, { dueDate: null, remindTime: null }, NOW)
    expect(next.dueDate).toBeNull()
    expect(next.remindTime).toBeNull()
  })

  it('status 与 completedAt 无法通过 patch 篡改', () => {
    // 关键安全性质：否则用户能把任务直接改成「已完成」来白刷成就
    const next = applyTaskPatch(base, { status: TASK_STATUS.DONE, completedAt: '2026-01-01 00:00:00' }, NOW)
    expect(next.status).toBe(TASK_STATUS.ONGOING)
    expect(next.completedAt).toBeNull()
  })

  it('id 与 createdAt 无法被覆盖', () => {
    const next = applyTaskPatch(base, { id: 'hacked', createdAt: '1999-01-01 00:00:00' }, NOW)
    expect(next.id).toBe(base.id)
    expect(next.createdAt).toBe(base.createdAt)
  })

  it('是纯函数，不改原对象', () => {
    const snapshot = { ...base }
    applyTaskPatch(base, { title: '夜跑' }, NOW)
    expect(base).toEqual(snapshot)
  })
})

describe('completeTask', () => {
  it('置为已完成并记录完成时间', () => {
    const task = buildTask({ title: '晨跑' }, NOW)
    const { task: done, changed } = completeTask(task, NOW)
    expect(changed).toBe(true)
    expect(done.status).toBe(TASK_STATUS.DONE)
    expect(done.completedAt).toBe('2026-09-15 10:00:00')
  })

  it('重复完成是幂等的，changed 为 false', () => {
    // 保证不会重复发放成就
    const task = buildTask({ title: '晨跑' }, NOW)
    const first = completeTask(task, NOW)
    const second = completeTask(first.task, NOW)
    expect(second.changed).toBe(false)
    expect(second.task).toBe(first.task)
  })
})

describe('abandonTask', () => {
  it('置为已放弃', () => {
    const task = buildTask({ title: '晨跑' }, NOW)
    expect(abandonTask(task, NOW).status).toBe(TASK_STATUS.ABANDONED)
  })

  it('已完成的任务不能放弃', () => {
    const task = buildTask({ title: '晨跑' }, NOW)
    const { task: done } = completeTask(task, NOW)
    expect(() => abandonTask(done, NOW)).toThrow('已完成的任务不能标记为放弃')
  })
})

describe('overdueTaskIds', () => {
  it('只挑进行中且截止时间已过的', () => {
    const tasks = [
      { id: 'a', status: TASK_STATUS.ONGOING, deleted: 0, dueDate: '2026-09-14 10:00:00' },
      { id: 'b', status: TASK_STATUS.ONGOING, deleted: 0, dueDate: '2026-09-16 10:00:00' },
      { id: 'c', status: TASK_STATUS.DONE, deleted: 0, dueDate: '2026-09-14 10:00:00' },
      { id: 'd', status: TASK_STATUS.ONGOING, deleted: 0, dueDate: null }
    ]
    expect(overdueTaskIds(tasks, NOW)).toEqual(['a'])
  })

  it('没有截止时间的任务永远不会逾期', () => {
    const tasks = [{ id: 'a', status: TASK_STATUS.ONGOING, deleted: 0, dueDate: null }]
    expect(overdueTaskIds(tasks, NOW)).toEqual([])
  })

  it('已放弃的任务不会被标记逾期', () => {
    const tasks = [{ id: 'a', status: TASK_STATUS.ABANDONED, deleted: 0, dueDate: '2020-01-01 00:00:00' }]
    expect(overdueTaskIds(tasks, NOW)).toEqual([])
  })

  it('已删除的任务不参与', () => {
    const tasks = [{ id: 'a', status: TASK_STATUS.ONGOING, deleted: 1, dueDate: '2020-01-01 00:00:00' }]
    expect(overdueTaskIds(tasks, NOW)).toEqual([])
  })
})

describe('markOverdue', () => {
  it('有变更时返回 changed 为 true 并更新状态', () => {
    const tasks = [{ id: 'a', status: TASK_STATUS.ONGOING, deleted: 0, dueDate: '2026-09-14 10:00:00' }]
    const result = markOverdue(tasks, NOW)
    expect(result.changed).toBe(true)
    expect(result.tasks[0].status).toBe(TASK_STATUS.OVERDUE)
  })

  it('无变更时不产生新数组（避免无谓写盘）', () => {
    const tasks = [{ id: 'a', status: TASK_STATUS.ONGOING, deleted: 0, dueDate: null }]
    const result = markOverdue(tasks, NOW)
    expect(result.changed).toBe(false)
    expect(result.tasks).toBe(tasks)
  })
})

describe('sortTasks', () => {
  it('先按状态升序，同状态内按创建时间倒序', () => {
    const tasks = [
      { id: 'done', status: TASK_STATUS.DONE, createdAt: '2026-09-01 10:00:00' },
      { id: 'old', status: TASK_STATUS.ONGOING, createdAt: '2026-09-01 10:00:00' },
      { id: 'new', status: TASK_STATUS.ONGOING, createdAt: '2026-09-10 10:00:00' }
    ]
    expect(sortTasks(tasks).map((task) => task.id)).toEqual(['new', 'old', 'done'])
  })
})

describe('visibleTasks', () => {
  it('过滤掉逻辑删除的记录', () => {
    const tasks = [{ id: 'a', deleted: 0 }, { id: 'b', deleted: 1 }]
    expect(visibleTasks(tasks).map((task) => task.id)).toEqual(['a'])
  })
})
