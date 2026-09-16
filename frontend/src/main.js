import { createApp } from 'vue'
import { createPinia } from 'pinia'
/*
 * 样式引入顺序**不能改**。
 *
 * theme.css 里有约三十条 `.el-*` 组件精修规则，与 Element Plus 自身规则优先级
 * 相同，完全靠「后加载者生效」取胜。把主题挪到前面，按钮、卡片、对话框的精修
 * 就会被官方样式盖回去，界面退化成默认蓝色调——而构建不会报任何错。
 *
 * 这也是本项目没有采用「样式按需引入」的原因，详见 vite.config.js 的说明。
 */
import 'element-plus/dist/index.css'
import './styles/theme.css'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { useUserStore } from './stores/user'
import { initStorage, ensureMeta } from './storage'
import { runMaintenance, startMaintenanceLoop } from './repository/maintenance'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

/*
 * 这里不再有 `app.use(ElementPlus)`。
 *
 * 组件由 unplugin-vue-components 在模板里按需注册，ElMessage / ElMessageBox
 * 这类命令式 API 由 unplugin-auto-import 自动引入（见 vite.config.js）。
 * 好处是入口 chunk 不再打包含全量组件；代价是这两个 API 在使用处看不到 import
 * 语句——如果你在找它们从哪来，答案在 vite.config.js。
 */

/**
 * 启动流程。
 *
 * 本地化之后没有「先登录拿 userId」这一步，但仍有三件事必须**在挂载前完成**，
 * 否则首屏会渲染出错误的等级/连续天数，或者把本该已经开启的胶囊显示成封存中：
 *
 * 1. `initStorage` —— 探测存储后端。IndexedDB 不可用（隐私窗口、企业策略屏蔽
 *    站点数据）时会降级到内存存储，此时**必须明确告知用户**，否则他会以为
 *    数据已经保存好了，关掉页面才发现全没了；
 * 2. `ensureMeta` —— 首次使用时写入 schemaVersion，供导入与迁移判断来源版本；
 * 3. `runMaintenance` —— 补跑「到期胶囊自动开启」与「逾期任务标记」，
 *    它们原本由后端每分钟的定时任务负责。
 *
 * 任何一步失败都照样挂载：空态页面远比白屏有用，而且用户能看到具体错误。
 */
async function bootstrap() {
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
