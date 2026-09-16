/**
 * 对话接口：把「用户说了一句话」这件事串成一次完整的来回。
 *
 * ## 一次发送做了七件事
 *
 * 1. 校验输入（非空、不超长）
 * 2. 取出该对象的已有历史（**在插入本轮之前**，否则这一句会被算两遍）
 * 3. 取出人设来源：胶囊原文，或分身的画像 + 说话风格 + 它引用的材料
 * 4. 组装 messages（system 人设 + 最近若干轮 + 本轮）
 * 5. 发一次同源请求（`api/ai.js`）
 * 6. **两条记录一次写入**（用户 + AI），失败则一条都不留
 * 7. 给用户这句话打一个情绪标签
 *
 * 第 6 条是有意为之：失败时界面的处理是「把文字还给输入框」，
 * 如果用户那条已经落库，历史里就会多出一条永远等不到回复的幽灵消息。
 *
 * ## 页面的边界
 *
 * 与知识库、分身一样，这里把领域层的东西**转出去**给页面用
 * （常量与纯函数），页面不必知道 `domain/` 的存在。
 */
import { run } from './local'
import { getLocale } from '../i18n'
import { requestChat } from './ai'
import {
  CHAT_MODE,
  buildChatMessages,
  chattablePersonas,
  checkMessage,
  detectEmotion,
  pickCapsule,
  pickPersona
} from '../domain/chat'
import * as chatRepo from '../repository/chatRepo'
import * as capsuleRepo from '../repository/capsuleRepo'
import * as taskRepo from '../repository/taskRepo'
import * as personaRepo from '../repository/personaRepo'
import * as knowledgeRepo from '../repository/knowledgeRepo'

export { CHAT_LIMITS, CHAT_MODE, DIALOGUE_ROLE, EMOTION } from '../domain/chat'

/** 把「模式 + 对象 id」拼成仓储认得的形状。 */
const scopeOf = (mode, targetId) => (
  mode === CHAT_MODE.PERSONA ? { personaId: targetId } : { capsuleId: targetId }
)

/**
 * 分身引用过、且现在还在的那几篇材料。
 *
 * 召回只在这几篇里做，理由见 `domain/chat.js` 的 `retrieveSnippets`：
 * 分身的定义就是「这几篇材料的蒸馏」，从别处召回会让它提起自己没经历过的事。
 * 已被删掉的材料直接跳过——它们不该再出现在任何对话里。
 */
async function materialsOf(persona) {
  const wanted = new Set(persona.docIds ?? [])
  if (wanted.size === 0) return []

  const docs = await knowledgeRepo.loadDocs()
  return docs.filter((doc) => wanted.has(doc.id) && doc.deleted !== 1)
}

/**
 * 可以对话的对象。
 *
 * 返回的是**原始实体**，标题怎么显示交给页面（要跟界面语言走）。
 *
 * @param {string} mode - CHAT_MODE 的取值
 * @returns {Promise<Array>}
 */
export const listTargets = (mode) => run(async () => {
  if (mode === CHAT_MODE.PERSONA) {
    const list = chattablePersonas(await personaRepo.loadPersonas())
    return list.map((item) => ({
      id: item.id,
      name: item.name,
      selfDate: item.selfDate,
      docCount: (item.docIds ?? []).length,
      createdAt: item.createdAt
    }))
  }

  const list = await capsuleRepo.listOpened()
  return list.map((item) => ({
    id: item.id,
    content: item.content,
    createdAt: item.createdAt,
    openedAt: item.openedAt
  }))
})

/**
 * 某个对象的完整对话历史（时间正序）。
 * @param {string} mode
 * @param {string} targetId
 */
export const getHistory = (mode, targetId) => run(() => chatRepo.history(scopeOf(mode, targetId)))

/**
 * 清空某个对象的对话历史。
 *
 * 至于「删掉分身时连它的对话一起删掉」，那件事在 `personaRepo.remove` 里做，
 * 不在这里——用户从分身页删除时并不会经过对话页。
 */
export const clearHistory = (mode, targetId) => run(() => chatRepo.removeByTarget(scopeOf(mode, targetId)))

/**
 * 发一句话，拿回 AI 的回复。
 *
 * @param {string} mode
 * @param {string} targetId
 * @param {string} message
 * @returns {Promise<{user: object, ai: object}>} 本轮落库的两条记录
 */
export const sendMessage = (mode, targetId, message) => run(async () => {
  // 先校验输入：超长如果等到落盘才发现，那次模型调用已经花掉了
  const text = checkMessage(message)

  const scope = scopeOf(mode, targetId)
  const history = await chatRepo.history(scope)

  let target
  let docs = []
  if (mode === CHAT_MODE.PERSONA) {
    target = pickPersona(await personaRepo.loadPersonas(), targetId)
    docs = await materialsOf(target)
  } else {
    target = pickCapsule(await capsuleRepo.loadCapsules(), targetId)
    // 关联任务不是必须的：胶囊也可以是一句独立的话
    const task = target.taskId
      ? (await taskRepo.loadTasks()).find((item) => item.id === target.taskId) ?? null
      : null
    target = { ...target, task }
  }

  const messages = buildChatMessages({
    mode,
    target,
    docs,
    history,
    message: text,
    lang: getLocale()
  })

  const reply = await requestChat(messages)

  return chatRepo.appendTurn({
    ...scope,
    message: text,
    reply,
    emotionTag: detectEmotion(text)
  })
})
