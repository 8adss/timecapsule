/**
 * 用户档案接口。
 *
 * 本地化之后没有「登录」——不存在账号、openid、多用户列表。原先的
 * `login` / `getUser` / `updateUser` 三个函数随之消失，取而代之的是
 * 「取本机档案」与「更新本机档案」。
 *
 * 头像不再上传到服务器，而是**在浏览器里压缩成 dataURL 后存进 IndexedDB**。
 * 压缩这一步是必需的：不压缩的话几张手机照片就能让导出文件膨胀到几十兆。
 */
import { run } from './local'
import * as profileRepo from '../repository/profileRepo'
import { prepareAvatar } from '../utils/image'

/** 取得本机档案；首次调用会自动创建。 */
export const getProfile = () => run(() => profileRepo.get())

/** 更新昵称 / 头像。空字符串表示不修改。 */
export const updateProfile = (patch) => run(() => profileRepo.update(patch))

/**
 * 更换头像。
 * @param {File} file - 用户选择的图片文件
 * @returns {Promise<object>} 更新后的档案
 */
export const uploadAvatar = (file) => run(async () => {
  const dataUrl = await prepareAvatar(file)
  return profileRepo.setAvatar(dataUrl)
})
