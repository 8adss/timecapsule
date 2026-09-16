/**
 * 示例内容的写入与清空。
 *
 * 这是唯一一个**跨集合**的仓储：写一次示例要同时动 `knowledge`、`personas`
 * 与 `meta` 三个键，所以必须走 `writeMany`（IndexedDB 单事务）。
 * 否则可能出现「文档写进去了、分身没写进去」这种半途状态——
 * 而横幅还会指着那批不存在的记录。
 *
 * 判定逻辑（该不该写、哪几条算示例）全在 `domain/demo.js`，本层只负责读写。
 */
import { read, write, writeMany, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { nowDateTimeString } from '../domain/time.js'
import {
  buildDemoMeta,
  buildDemoSeed,
  demoIdsFrom,
  demoStateFrom,
  shouldSeedDemo
} from '../domain/demo.js'

/** 读出与示例相关的三个键，并保证类型正确（存储可能被手改过）。 */
async function readScope() {
  const [meta, knowledge, personas] = await Promise.all([
    read(KEY.meta, {}),
    read(KEY.knowledge, []),
    read(KEY.personas, [])
  ])

  return {
    meta: meta && typeof meta === 'object' ? meta : {},
    knowledge: Array.isArray(knowledge) ? knowledge : [],
    personas: Array.isArray(personas) ? personas : []
  }
}

/**
 * 把给定 id 的记录标记为已删除，返回新数组与改动条数。
 * 与其它仓储一致：逻辑删除，留下墓碑，免得被一份较旧的备份合并时复活。
 */
function markDeleted(list, wantedIds, timestamp) {
  let changed = 0

  const next = list.map((item) => {
    if (!wantedIds.has(item.id) || item.deleted === 1) return item
    changed += 1
    return { ...item, deleted: 1, updatedAt: timestamp }
  })

  return { list: next, changed }
}

/**
 * 横幅用的状态：示例内容还在不在、各有几条、是否已被「不再提示」。
 * @returns {Promise<{active: boolean, dismissed: boolean, docCount: number, personaCount: number}>}
 */
export async function state() {
  return demoStateFrom(await readScope())
}

/**
 * 首次打开时写入示例内容。
 *
 * 不该写就什么都不做（不持锁、不落盘）：三个条件见 `domain/demo.js` 的
 * `shouldSeedDemo`——从没写过示例、知识库为空、也没有任何分身。
 *
 * @param {string} [lang] - 界面语言，决定写入中文还是英文示例
 * @param {Date} [now] - 参考时刻
 * @returns {Promise<{seeded: boolean, docs?: number, personas?: number}>}
 */
export async function seedIfNeeded(lang, now = new Date()) {
  return withWriteLock(async () => {
    const current = await readScope()
    if (!shouldSeedDemo(current)) {
      return { seeded: false }
    }

    const seed = buildDemoSeed(lang, now)
    await writeMany([
      [KEY.knowledge, [...current.knowledge, ...seed.docs]],
      [KEY.personas, [...current.personas, ...seed.personas]],
      [KEY.meta, buildDemoMeta(current.meta, seed, now)]
    ])

    return { seeded: true, docs: seed.docs.length, personas: seed.personas.length }
  })
}

/**
 * 清空示例内容。
 *
 * **按记下的 id 精确删除**，绝不按「标题像示例」之类的启发式判断去动数据——
 * 用户自己写的任何东西都不该被这个操作碰到。
 *
 * `demoSeededAt` 刻意保留：清空之后不会又冒出来一份。
 *
 * @param {Date} [now]
 * @returns {Promise<{docs: number, personas: number}>} 实际清掉几条
 */
export async function clear(now = new Date()) {
  return withWriteLock(async () => {
    const current = await readScope()
    const ids = demoIdsFrom(current.meta)
    const timestamp = nowDateTimeString(now)

    const docs = markDeleted(current.knowledge, new Set(ids.knowledge), timestamp)
    const personas = markDeleted(current.personas, new Set(ids.personas), timestamp)

    await writeMany([
      [KEY.knowledge, docs.list],
      [KEY.personas, personas.list],
      [KEY.meta, { ...current.meta, demoIds: { knowledge: [], personas: [] } }]
    ])

    return { docs: docs.changed, personas: personas.changed }
  })
}

/**
 * 「保留示例，不再提示」——只把横幅收起来，示例数据留着。
 * 用户想拿它给朋友演示时，不必每次都看见这条提示。
 * @returns {Promise<void>}
 */
export async function dismiss() {
  return withWriteLock(async () => {
    const current = await readScope()
    await write(KEY.meta, { ...current.meta, demoDismissed: true })
  })
}
