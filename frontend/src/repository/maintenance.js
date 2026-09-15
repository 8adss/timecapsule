/**
 * 本地维护任务。
 *
 * 后端原本有两个每分钟执行的定时任务（`CapsuleScheduledTask`）：
 * 自动开启到期胶囊、把逾期任务标记为已逾期。本地应用没有服务端调度器，
 * 改用两种触发方式覆盖同样的场景：
 *
 * 1. **应用启动时跑一次** —— 用户隔几天再打开，胶囊该开的要开、任务该逾期的要逾期；
 * 2. **每分钟跑一次（仅页面可见时）** —— 页面一直开着时也能到点生效。
 *
 * 「仅可见时」很重要：后台标签页里空转一分钟一次纯属浪费电，而且用户看不到结果。
 */
import { markOverdueTasks } from './taskRepo.js'
import { autoOpenDue } from './capsuleRepo.js'

/** 维护间隔，与后端定时任务的一分钟保持一致。 */
const INTERVAL_MS = 60_000

/**
 * 执行一次维护。
 *
 * 两个子任务各自 try/catch，与后端一致——一个失败不应阻断另一个，
 * 否则一个坏掉的胶囊会连带让所有任务停止标记逾期。
 *
 * @param {Date} [now] - 参考时刻
 * @returns {Promise<{ overdue: number, opened: number, failed: string[] }>}
 */
export async function runMaintenance(now = new Date()) {
  const result = { overdue: 0, opened: 0, failed: [] }

  try {
    result.overdue = await markOverdueTasks(now)
  } catch (error) {
    result.failed.push(`标记逾期任务失败：${error?.message ?? error}`)
  }

  try {
    result.opened = await autoOpenDue(now)
  } catch (error) {
    result.failed.push(`自动开启胶囊失败：${error?.message ?? error}`)
  }

  return result
}

/**
 * 启动周期性维护。
 *
 * @param {{ intervalMs?: number }} [options]
 * @returns {() => void} 停止函数
 */
export function startMaintenanceLoop({ intervalMs = INTERVAL_MS } = {}) {
  const timer = setInterval(() => {
    // 页面不可见时跳过：到点要在用户看得到的时候才生效
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }
    runMaintenance().catch(() => {
      // runMaintenance 内部已逐项兜底，这里只防未处理的拒绝
    })
  }, intervalMs)

  return () => clearInterval(timer)
}
