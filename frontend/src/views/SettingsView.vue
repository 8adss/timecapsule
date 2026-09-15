<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">设置</h1>
        <p class="page-desc">数据存储与关于</p>
      </div>
    </div>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">数据存储</span>
      </template>

      <div class="row">
        <span class="label">存储位置</span>
        <span class="value">本机浏览器（IndexedDB）</span>
      </div>
      <div class="row">
        <span class="label">联网情况</span>
        <span class="value">完全离线可用，不会向任何服务器发送数据</span>
      </div>

      <el-alert
        class="warn"
        type="warning"
        :closable="false"
        show-icon
        title="数据只存在这台设备上"
        description="清除浏览器数据、使用无痕模式、或更换设备都会导致数据消失。请定期导出备份。"
      />
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">备份与恢复</span>
      </template>
      <p class="muted">
        导出 / 导入功能正在开发中，将在下一个版本提供。
        届时你可以把全部数据导出成一个文件，换设备或重装浏览器后导入即可恢复。
      </p>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">关于</span>
      </template>
      <div class="row">
        <span class="label">应用</span>
        <span class="value">TimeCapsule · 时间胶囊</span>
      </div>
      <div class="row">
        <span class="label">版本</span>
        <span class="value">{{ version }}</span>
      </div>
      <div class="row">
        <span class="label">架构</span>
        <span class="value">本地优先 · 无账号 · 无后端</span>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const version = ref(__APP_VERSION__)
</script>

<style scoped>
.card {
  margin-bottom: var(--sp-4);
}
.card-title {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--mt-text);
}
.row {
  display: flex;
  gap: var(--sp-3);
  padding: 6px 0;
  font-size: var(--fs-sm);
}
.label {
  width: 84px;
  flex-shrink: 0;
  color: var(--mt-text-faint);
}
.value {
  color: var(--mt-text-sub);
}
.warn {
  margin-top: var(--sp-3);
}
.muted {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: var(--lh-base);
  color: var(--mt-text-muted);
}
</style>
