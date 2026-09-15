import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
// 主题必须放在 element-plus 样式之后，否则覆盖不掉默认蓝色
import './styles/theme.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/user'
import { initStorage, ensureMeta } from './storage'
import { runMaintenance, startMaintenanceLoop } from './repository/maintenance'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

/**
 * 启动流程。
 *
 * 改造前这里是「先向后端登录拿 userId 再挂载」。本地化之后没有登录，
 * 但仍然需要三步准备工作，且都必须**在挂载前完成**，否则首屏会渲染出
 * 错误的等级/连续天数，或者把本该已经开启的胶囊显示成封存中：
 *
 * 1. `ensureMeta` —— 首次使用时写入 schemaVersion，供导入与迁移判断来源版本；
 * 2. `runMaintenance` —— 补跑「到期胶囊自动开启」与「逾期任务标记」，
 *    它们原本由后端每分钟的定时任务负责；
 * 3. 读取本机档案。
 *
 * 任何一步失败都照样挂载：空态页面远比白屏有用，而且用户能看到具体错误。
 */
async function bootstrap() {
  // 先探测存储后端。IndexedDB 不可用（隐私窗口、企业策略屏蔽站点数据）时
  // 会自动降级到内存存储——这时**必须明确告知用户**，否则他会以为数据
  // 已经保存好了，关掉页面才发现全没了。
  const storage = await initStorage()
  if (!storage.persistent) {
    ElMessage.warning('当前浏览器禁用了本地存储，数据只保留在本次会话中，刷新即丢失')
    console.warn('本地存储不可用，已降级为内存模式：', storage.reason)
  }

  try {
    await ensureMeta()

    const maintenance = await runMaintenance()
    if (maintenance.failed.length > 0) {
      console.warn('启动维护存在失败项：', maintenance.failed.join('；'))
    }
  } catch (error) {
    console.error('本地存储初始化失败，数据可能无法保存：', error)
  }

  try {
    await useUserStore().load()
  } catch (error) {
    console.error('读取本机档案失败：', error)
  }

  app.mount('#app')

  // 页面一直开着时也要到点生效（仅可见时执行，见 maintenance.js）
  startMaintenanceLoop()
}

bootstrap()
