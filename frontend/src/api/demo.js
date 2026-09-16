/**
 * 示例内容的接口（横幅与「清空示例」用）。
 *
 * 它跨知识库与分身两个集合，所以没有挂在其中任何一边，单独放一个模块。
 */
import { run } from './local'
import * as demoRepo from '../repository/demoRepo'

/** 横幅状态：示例还在不在、各有几条、是否已被「不再提示」。 */
export const getDemoState = () => run(() => demoRepo.state())

/** 清空示例内容（按记下的 id 精确删除，不碰用户自己的数据）。 */
export const clearDemo = () => run(() => demoRepo.clear())

/** 保留示例，只是不再提示。 */
export const dismissDemo = () => run(() => demoRepo.dismiss())
