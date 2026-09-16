/**
 * 构建后处理：为纯静态托管准备 SPA fallback。
 *
 * 为什么必须有这一步：应用用的是 HTML5 history 路由，`/app/tasks` 在服务器上
 * 并不存在对应文件。静态托管平台在找不到文件时会返回自己的 404 页面，
 * 用户在那里按 F5 或直接粘链接进来，看到的就是 404 而不是应用——
 * 而这类问题在本地 `npm run dev` 时完全不会出现（开发服务器自带 fallback），
 * 往往要等到部署之后才被发现。
 *
 * 各平台的做法不一样，这里一次性都生成：
 * - **GitHub Pages**：把 `index.html` 复制成 `404.html`，它会把找不到的路径
 *   交给这个页面，路由随即接管。
 * - **Netlify / Cloudflare Pages**：读 `_redirects`，把所有路径 200 重写到
 *   `index.html`（不是 301，否则地址栏会被改写，刷新逻辑就断了）。
 * - **`.nojekyll`**：GitHub Pages 默认用 Jekyll 处理站点，会忽略下划线开头的
 *   文件与目录。目前产物里没有这类名字，但加上它是零成本的保险。
 * - **Cloudflare Pages 的 `_routes.json`**：只让 `/api/*` 进 Pages Function。
 *   这一条不是可选的，理由见下面那段注释。
 *
 * ⚠️ **已知副作用（部署在 Cloudflare 时）**：产物里同时存在 `404.html` 时，
 * Cloudflare 对不存在的路径会返回 `404.html` 的内容**并带上 404 状态码**，
 * 且优先级高于 `_redirects`。页面照样能打开（内容就是应用本体），
 * 但直接分享 `/app/xxx` 这种深链接时，抓取预览卡片的爬虫看到的是 404。
 * 在 Cloudflare 控制台把构建命令改成 `npm run build && rm -f dist/404.html`
 * 即可解决（`404.html` 只为 GitHub Pages 而生成）。
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const indexHtml = join(dist, 'index.html')

if (!existsSync(indexHtml)) {
  console.error('postbuild: 找不到 dist/index.html，请先执行 vite build')
  process.exit(1)
}

// GitHub Pages 的 SPA fallback
copyFileSync(indexHtml, join(dist, '404.html'))

// Netlify / Cloudflare Pages 的 SPA fallback
writeFileSync(join(dist, '_redirects'), '/*    /index.html   200\n', 'utf8')

// 让 GitHub Pages 跳过 Jekyll 处理
writeFileSync(join(dist, '.nojekyll'), '')

/*
 * Cloudflare Pages 的 Functions 调用范围。
 *
 * **没有这个文件会把免费额度白白烧掉。** 官方文档写得很直白：项目一旦有了
 * `functions` 目录，**默认每一次请求都会调用函数**——包括 js/css/图片这些纯静态请求。
 * 而 Pages 的免费额度是「静态请求不限量，函数请求每天 10 万次」，
 * 于是加了一个 AI 转发之后，站点的静态访问也会开始消耗函数额度。
 *
 * `include` 只留 `/api/*`：其余路径一律按纯静态资源处理，回到不限量那一档。
 */
writeFileSync(
  join(dist, '_routes.json'),
  `${JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2)}\n`,
  'utf8'
)

console.log('postbuild: 已生成 404.html、_redirects、_routes.json、.nojekyll（SPA fallback 与函数范围）')
