import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// 开发端口。strictPort：端口被占用时直接报错退出，而不是静默顺延到别的端口——
// 顺延会让人以为服务没起来，问题反而更难查。
const DEV_PORT = 4113

/**
 * Element Plus 的引入方式：**组件按需、样式全量**。
 *
 * 这是本文件里唯一需要解释的取舍，改动前请先读完。
 *
 * 常规的按需方案是 `ElementPlusResolver()`（默认 `importStyle: 'css'`），
 * 它会连同每个组件的样式一起注入。但**本项目的主题靠加载顺序生效**：
 * `theme.css` 里有约三十条 `.el-*` 组件精修规则，与 Element Plus 自身规则
 * 优先级相同，全靠「主题在组件库之后加载」取胜。
 *
 * 按需注入样式会打破这个前提——组件样式被推进懒加载的 chunk，
 * 排在主题之后执行，于是按钮、卡片、对话框的精修全部被官方样式盖回去，
 * 界面悄悄退化成 Element Plus 默认蓝色调。这类问题只在运行时可见，
 * 构建完全成功，最容易被漏掉。
 *
 * 于是这里把 `importStyle` 关掉，样式统一由 main.js 按固定顺序全量引入：
 *     element-plus/dist/index.css  →  styles/theme.css
 * 换来的收益在 JS 一侧——入口 chunk 不再打包含全量组件，实测从 1.07 MB
 * 降到约 90 KB。代价是 CSS 仍是完整的一份（约 50 KB gzip），
 * 包括官网落地页也带上它。这个代价是可接受的：CSS 压缩后不大，
 * 而主题错乱是肉眼可见的回归。
 *
 * 若将来要连 CSS 也按需，必须先让主题不再依赖顺序——把组件精修规则的
 * 选择器提到 `.el-*` 之外（例如统一加 `html` 前缀提高优先级），
 * 并且**用眼睛确认一遍全部页面**，不能只看构建是否通过。
 */
const elementPlusResolver = () => ElementPlusResolver({ importStyle: false })

export default defineConfig({
  plugins: [
    vue(),
    /*
     * 自动引入 ElMessage / ElMessageBox 这类命令式 API。
     *
     * `dts: true` 会生成 `auto-imports.d.ts` / `components.d.ts`——它们是自动引入
     * 这套机制唯一的「说明书」。自动引入最容易被诟病的一点就是「代码里看不到
     * import，不知道东西从哪来」，这两个文件正好回答这个问题，编辑器也据此提供
     * 补全。因此**建议提交进仓库**，而不是当成构建产物忽略掉。
     */
    AutoImport({ resolvers: [elementPlusResolver()], dts: true }),
    // 自动注册模板里用到的 <el-xxx> 组件
    Components({ resolvers: [elementPlusResolver()], dts: true })
  ],

  // 应用内（设置页的「关于」）需要显示版本号，从 package.json 注入，避免两处手改
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },

  server: {
    port: DEV_PORT,
    strictPort: true
    // 这里原本有 /api 与 /uploads 两个转发到后端 4114 的代理。
    // 本地优先改造之后应用不再访问后端，代理已移除；
    // 将来若接入外接存储需要走网络，再按那时的端点加回来。
  },

  preview: {
    port: DEV_PORT,
    strictPort: true
  }
})
