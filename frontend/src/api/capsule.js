/**
 * 时间胶囊接口。转发到仓储层，见 task.js 顶部的说明。
 */
import { run } from './local'
import * as capsuleRepo from '../repository/capsuleRepo'

/** 全部胶囊，封存中的排在前面。 */
export const listCapsules = () => run(() => capsuleRepo.list())

/** 只取已开启的胶囊。 */
export const listOpenedCapsules = () => run(() => capsuleRepo.listOpened())

/** 封存一条新胶囊。 */
export const createCapsule = (data) => run(() => capsuleRepo.create(data))

/** 开启胶囊，并补发相应成就。 */
export const openCapsule = (id) => run(() => capsuleRepo.open(id))
