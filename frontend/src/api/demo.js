/**
 * 示例内容的接口（横幅、清空示例、设置页的手动载入）。
 *
 * 它跨知识库、分身与胶囊三个集合，所以没有挂在其中任何一边，单独放一个模块。
 */
import { run } from './local'
import { getLocale } from '../i18n'
import * as demoRepo from '../repository/demoRepo'

/** 横幅状态：示例还在不在、各有几条、是否已被「不再提示」。 */
export const getDemoState = () => run(() => demoRepo.state())

/** 清空示例内容（按记下的 id 精确删除，不碰用户自己的数据）。 */
export const clearDemo = () => run(() => demoRepo.clear())

/** 保留示例，只是不再提示。 */
export const dismissDemo = () => run(() => demoRepo.dismiss())

/**
 * 手动载入一份示例内容（设置页）。
 *
 * 语言跟随当前界面语言：示例是**写进数据库的数据**，写下去之后就固定了，
 * 不能等用户切语言时再变。已经在的那一份还活着时不会重复写。
 */
export const loadDemo = () => run(() => demoRepo.seedNow(getLocale()))
