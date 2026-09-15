/**
 * 任务接口。
 *
 * 本地化之后这里不再是 HTTP 调用，而是转发到仓储层——但**保留这一层的意义**在于：
 * 页面只依赖这几个函数名，将来接外接存储（走网络）时，改动局限在本文件内部，
 * 页面与仓储都不用动。它是「传输方式」与「业务逻辑」之间的接缝。
 *
 * 不再有 `userId` 参数：本地应用是单用户的，没有账号也没有用户列表。
 */
import { run } from './local'
import * as taskRepo from '../repository/taskRepo'

/** 全部任务，按状态、创建时间排序。 */
export const listTasks = () => run(() => taskRepo.list())

/** 新建任务；带 capsuleContent 时顺带封存一条时间胶囊。 */
export const createTask = (data) => run(() => taskRepo.create(data))

/** 修改任务基本信息。 */
export const updateTask = (id, data) => run(() => taskRepo.update(id, data))

/** 删除任务（逻辑删除）。 */
export const deleteTask = (id) => run(() => taskRepo.remove(id))

/** 完成任务，并触发成就、连续打卡、成长等级的完整闭环。 */
export const completeTask = (id) => run(() => taskRepo.complete(id))

/** 放弃任务。 */
export const abandonTask = (id) => run(() => taskRepo.abandon(id))
