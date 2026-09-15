import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 主题必须放在 element-plus 样式之后，否则覆盖不掉默认蓝色
import './styles/theme.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/user'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 先登录拿到 userId，再挂载应用。
// 这样首屏所有接口都带着正确的用户身份发出；登录失败（比如后端没启动）
// 也照样挂载，用户能看到错误提示而不是一片空白。
const userStore = useUserStore()
userStore
  .ensureLogin()
  .catch((e) => {
    console.error('登录失败，请确认后端已启动：', e)
  })
  .finally(() => {
    app.mount('#app')
  })
