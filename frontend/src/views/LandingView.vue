<template>
  <div class="landing">
    <!-- 顶栏：字标 + 锚点导航 + 进入应用 -->
    <header class="topbar">
      <div class="wrap topbar-inner">
        <router-link to="/" class="brand-script">TimeCapsule</router-link>
        <nav class="topnav">
          <a href="#features">功能</a>
          <a href="#data">数据</a>
          <a :href="repoUrl" target="_blank" rel="noopener noreferrer">源码</a>
        </nav>
        <router-link to="/app/tasks" class="btn btn-primary">进入应用</router-link>
      </div>
    </header>

    <!-- 主视觉 -->
    <section class="hero">
      <div class="wrap hero-inner">
        <p class="eyebrow">本地优先 · 无需注册 · 完全离线</p>
        <h1 class="hero-title">
          写给未来的自己<br />
          <span class="accent">然后等着收信</span>
        </h1>
        <p class="hero-sub">
          把此刻的决心封成一枚时间胶囊，定在未来某一天开启。
          在那之前，用任务清单一天天兑现它。
        </p>
        <div class="hero-actions">
          <router-link to="/app/tasks" class="btn btn-primary btn-lg">开始使用</router-link>
          <a :href="repoUrl" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-lg">
            查看源码
          </a>
        </div>
        <p class="hero-note">打开即用，数据存在你自己的浏览器里，不会上传到任何服务器。</p>
      </div>
    </section>

    <!-- 功能 -->
    <section id="features" class="section">
      <div class="wrap">
        <h2 class="section-title">三件事，构成一个闭环</h2>
        <p class="section-sub">立志、执行、回看——时间胶囊把这三步串在一起。</p>

        <div class="cards">
          <article v-for="item in features" :key="item.title" class="card">
            <span class="card-icon">
              <NavIcon :name="item.icon" />
            </span>
            <h3 class="card-title">{{ item.title }}</h3>
            <p class="card-desc">{{ item.desc }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- 数据说明：这是本应用与多数同类产品最大的不同，单独讲清楚 -->
    <section id="data" class="section section-alt">
      <div class="wrap data-inner">
        <div class="data-copy">
          <h2 class="section-title">你的记录，只属于你</h2>
          <p class="section-sub">
            没有账号、没有服务器、没有埋点。所有内容都存在这台设备的浏览器里，
            断网也能照常用。
          </p>
          <ul class="data-list">
            <li>数据存在浏览器的 IndexedDB 中，不经过网络</li>
            <li>可随时导出成一个 JSON 文件备份</li>
            <li>换设备或重装浏览器后，导入该文件即可完整恢复</li>
            <li>开源可审查，代码里没有任何上报逻辑</li>
          </ul>
        </div>
        <aside class="data-aside">
          <div class="data-note">
            <div class="data-note-title">需要注意</div>
            <p>
              数据只在这一台设备上。清除浏览器数据、使用无痕模式、
              或更换设备都会让它消失——所以请记得定期导出备份。
            </p>
          </div>
        </aside>
      </div>
    </section>

    <!-- 结尾 -->
    <section class="section cta-section">
      <div class="wrap cta-inner">
        <h2 class="cta-title">现在就写给三个月后的自己</h2>
        <router-link to="/app/tasks" class="btn btn-primary btn-lg">开始使用</router-link>
      </div>
    </section>

    <footer class="footer">
      <div class="wrap footer-inner">
        <span class="footer-brand">TimeCapsule</span>
        <span class="footer-sep">·</span>
        <span>本地优先的时间胶囊与自律记事本</span>
        <span class="footer-spacer" />
        <a :href="repoUrl" target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    </footer>
  </div>
</template>

<script setup>
import NavIcon from '../components/NavIcon.vue'

/**
 * 仓库地址。
 *
 * 目前是占位——仓库还没有托管到 GitHub，M5 发布时改成真实地址即可。
 * 用常量集中一处，避免散落在模板里改漏。
 */
const repoUrl = 'https://github.com/'

const features = [
  {
    icon: 'capsule',
    title: '封存时间胶囊',
    desc: '写下此刻想对未来说的话，指定一个开启日期。到期后它会自动打开——不是提醒你去打开，而是真的到了时候自己出现。'
  },
  {
    icon: 'task',
    title: '用任务兑现它',
    desc: '把决心拆成可执行的任务，完成即打卡。连续打卡天数与成长等级由完成记录自动算出，不需要手动维护。'
  },
  {
    icon: 'achievement',
    title: '回看走过的路',
    desc: '完成 1、3、5、10… 个任务，开启第 1、2、3 枚胶囊，连续打卡 7 天——每个里程碑都会留下一枚徽章。'
  }
]
</script>

<style scoped>
/*
  落地页刻意不复用应用外壳，也不引入组件库：
  官网是给第一次来的人看的，加载越轻越好。
*/
.landing {
  min-height: 100vh;
  background: var(--mt-bg);
  color: var(--mt-text);
}

.wrap {
  max-width: 1060px;
  margin: 0 auto;
  padding: 0 28px;
}

/* ---------- 顶栏 ---------- */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(250, 247, 243, 0.86);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--mt-border-soft);
}
.topbar-inner {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  height: 62px;
}
.brand-script {
  font-family: "Ink Free", "Segoe Print", "Bradley Hand ITC", "Segoe Script", cursive;
  font-size: 21px;
  letter-spacing: 0.4px;
  color: var(--mt-text);
  text-decoration: none;
  white-space: nowrap;
}
.topnav {
  display: flex;
  gap: var(--sp-5);
  margin-left: auto;
}
.topnav a {
  font-size: var(--fs-base);
  color: var(--mt-text-sub);
  text-decoration: none;
  transition: color var(--dur) var(--ease);
}
.topnav a:hover {
  color: var(--mt-text);
}

/* ---------- 按钮 ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 18px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  font-size: var(--fs-base);
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease),
    color var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.btn-lg {
  padding: 13px 26px;
  font-size: var(--fs-lg);
}
.btn-primary {
  background: var(--mt-primary);
  color: #fff;
  box-shadow: var(--shadow-hairline);
}
.btn-primary:hover {
  background: var(--mt-primary-deep);
  transform: translateY(-1px);
}
.btn-ghost {
  border-color: var(--mt-border);
  color: var(--mt-text-sub);
  background: transparent;
}
.btn-ghost:hover {
  border-color: var(--mt-primary);
  color: var(--mt-primary-deep);
}

/* ---------- 主视觉 ---------- */
.hero {
  padding: 92px 0 76px;
}
.hero-inner {
  max-width: 760px;
}
.eyebrow {
  margin: 0 0 var(--sp-4);
  font-size: var(--fs-sm);
  letter-spacing: 1.4px;
  color: var(--mt-primary-deep);
}
.hero-title {
  margin: 0;
  font-size: 46px;
  line-height: 1.28;
  font-weight: 600;
  letter-spacing: -0.4px;
}
.hero-title .accent {
  color: var(--mt-primary);
}
.hero-sub {
  margin: var(--sp-5) 0 0;
  max-width: 560px;
  font-size: var(--fs-lg);
  line-height: var(--lh-loose);
  color: var(--mt-text-sub);
}
.hero-actions {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin-top: var(--sp-6);
}
.hero-note {
  margin: var(--sp-5) 0 0;
  font-size: var(--fs-sm);
  color: var(--mt-text-faint);
}

/* ---------- 通用分节 ---------- */
.section {
  padding: 76px 0;
}
.section-alt {
  background: var(--mt-surface);
  border-top: 1px solid var(--mt-border-soft);
  border-bottom: 1px solid var(--mt-border-soft);
}
.section-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.2px;
}
.section-sub {
  margin: var(--sp-3) 0 0;
  max-width: 560px;
  font-size: var(--fs-base);
  line-height: var(--lh-loose);
  color: var(--mt-text-sub);
}

/* ---------- 功能卡片 ---------- */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--sp-5);
  margin-top: var(--sp-6);
}
.card {
  padding: var(--sp-5);
  border: 1px solid var(--mt-border-soft);
  border-radius: var(--radius-lg);
  background: var(--mt-surface);
  box-shadow: var(--shadow-hairline);
}
.card-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: var(--sp-4);
  border-radius: var(--radius);
  background: var(--mt-primary-wash);
  color: var(--mt-primary-deep);
}
.card-icon :deep(.nav-icon) {
  width: 20px;
  height: 20px;
}
.card-title {
  margin: 0 0 var(--sp-2);
  font-size: var(--fs-lg);
  font-weight: 600;
}
.card-desc {
  margin: 0;
  font-size: var(--fs-base);
  line-height: var(--lh-loose);
  color: var(--mt-text-sub);
}

/* ---------- 数据说明 ---------- */
.data-inner {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: var(--sp-7);
  align-items: start;
}
.data-list {
  margin: var(--sp-5) 0 0;
  padding: 0;
  list-style: none;
}
.data-list li {
  position: relative;
  padding-left: 22px;
  margin-bottom: 10px;
  font-size: var(--fs-base);
  line-height: var(--lh-base);
  color: var(--mt-text-sub);
}
.data-list li::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mt-primary);
}
.data-note {
  padding: var(--sp-5);
  border: 1px solid var(--mt-border);
  border-left-width: 3px;
  border-radius: var(--radius);
  background: var(--mt-bg-soft);
}
.data-note-title {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--mt-primary-deep);
}
.data-note p {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: var(--lh-loose);
  color: var(--mt-text-sub);
}

/* ---------- 结尾 ---------- */
.cta-section {
  padding: 88px 0;
}
.cta-inner {
  text-align: center;
}
.cta-title {
  margin: 0 0 var(--sp-5);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.3px;
}

/* ---------- 页脚 ---------- */
.footer {
  border-top: 1px solid var(--mt-border-soft);
  background: var(--mt-surface);
}
.footer-inner {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  height: 68px;
  font-size: var(--fs-sm);
  color: var(--mt-text-faint);
}
.footer-brand {
  font-weight: 600;
  color: var(--mt-text-sub);
}
.footer-spacer {
  flex: 1;
}
.footer-inner a {
  color: var(--mt-text-sub);
  text-decoration: none;
}
.footer-inner a:hover {
  color: var(--mt-primary-deep);
}

/* 窄屏：数据说明从两栏变一栏，主标题收小 */
@media (max-width: 760px) {
  .hero {
    padding: 60px 0 52px;
  }
  .hero-title {
    font-size: 32px;
  }
  .data-inner {
    grid-template-columns: 1fr;
    gap: var(--sp-5);
  }
  .topnav {
    display: none;
  }
  .section {
    padding: 56px 0;
  }
}
</style>
