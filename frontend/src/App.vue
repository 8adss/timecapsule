<template>
  <!--
    根组件只负责「语言环境 + 渲染当前路由」。

    为什么样式外壳不在这里：`/` 是官网落地页，它不该套着应用的侧边栏；
    `/app/*` 才需要。于是让根组件保持空壳，由路由决定套哪一层布局：
      /      → views/LandingView.vue               （独立布局）
      /app/* → layouts/AppShell.vue → 各功能页

    这样还有一个实际好处：落地页是动态导入的，访问官网的人不会把应用外壳
    与功能页的代码一起下载下来。

    el-config-provider 是 Element Plus 的全局配置入口。改造前中文语言包是通过
    `app.use(ElementPlus, { locale: zhCn })` 装的；组件改为按需引入之后没有全局
    安装这一步了，语言包只能从组件树顶层注入——否则日期选择器的月份名、
    空状态文案、确认框按钮都会退回英文。
  -->
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup>
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>
