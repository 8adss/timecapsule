<template>
  <div class="page">
    <div class="page-head">
      <h1 class="page-title">{{ t('profile.title') }}</h1>
    </div>

    <el-card shadow="never" class="profile-card" v-loading="loading">
      <div class="profile-top">
        <div class="avatar-trigger" :title="t('profile.edit')" @click="editVisible = true">
          <el-avatar :size="60" :src="userStore.avatarUrl" class="profile-avatar">
            {{ userStore.avatarText }}
          </el-avatar>
          <span class="avatar-trigger-hint">{{ t('profile.editHint') }}</span>
        </div>
        <div class="profile-main">
          <div class="nickname">{{ userStore.displayName }}</div>
          <div class="storage-note">{{ t('profile.localNote') }}</div>
        </div>
        <el-button @click="editVisible = true">{{ t('profile.edit') }}</el-button>
      </div>

      <div class="stat-grid stats">
        <div class="stat-cell">
          <div class="value">Lv.{{ userStore.growthLevel }}</div>
          <div class="label">{{ t('profile.statLevel') }}</div>
        </div>
        <div class="stat-cell">
          <div class="value">{{ t('profile.streakUnit', { n: userStore.streakDays }) }}</div>
          <div class="label">{{ t('profile.statStreak') }}</div>
        </div>
        <div class="stat-cell">
          <div class="value">{{ doneCount }}</div>
          <div class="label">{{ t('profile.statDoneTasks') }}</div>
        </div>
        <div class="stat-cell">
          <div class="value">{{ capsuleCount }}</div>
          <div class="label">{{ t('profile.statOpenedCapsules') }}</div>
        </div>
      </div>

      <div class="level-tip">
        {{ t('profile.levelTip', { done: doneCount % 5 }) }}
        <el-progress :percentage="(doneCount % 5) * 20" :show-text="false" :stroke-width="6" />
      </div>
    </el-card>

    <h3>{{ t('profile.badges', { n: achievements.length }) }}</h3>
    <el-empty v-if="achievements.length === 0" :description="t('profile.noBadges')" />
    <div v-else class="badge-list">
      <div v-for="a in achievements" :key="a.id" class="badge" :style="{ borderColor: meta(a.type).color }">
        <span class="badge-icon">{{ meta(a.type).icon }}</span>
        <div>
          <div class="badge-title">{{ achievementLabel(a.type) }} × {{ a.value }}</div>
          <div class="badge-time">{{ t('profile.unlockedAt', { time: formatDateTime(a.unlockedAt) }) }}</div>
        </div>
      </div>
    </div>

    <!-- 编辑资料：头像上传 + 昵称 -->
    <el-dialog v-model="editVisible" :title="t('profile.edit')" width="460px">
      <el-form label-width="70px">
        <el-form-item :label="t('profile.avatarLabel')">
          <el-upload
            class="avatar-uploader"
            :show-file-list="false"
            :before-upload="beforeAvatarUpload"
            :http-request="doUploadAvatar"
            accept="image/png,image/jpeg,image/webp,image/gif"
          >
            <div class="avatar-edit" :class="{ uploading }">
              <el-avatar :size="84" :src="userStore.avatarUrl">
                {{ userStore.avatarText }}
              </el-avatar>
              <div class="avatar-edit-mask">{{ uploading ? t('profile.uploading') : t('profile.changeAvatar') }}</div>
            </div>
          </el-upload>
          <div class="form-hint">{{ t('profile.avatarHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('profile.nicknameLabel')">
          <el-input v-model="nicknameDraft" maxlength="50" :placeholder="t('profile.nicknamePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">{{ t('profile.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveNickname">
          {{ t('profile.saveNickname') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
// ElMessage 由 unplugin-auto-import 自动引入，见 vite.config.js
import { listAchievements } from '../api/achievement'
import { listOpenedCapsules } from '../api/capsule'
import { listTasks } from '../api/task'
import { useUserStore } from '../stores/user'
import { formatDateTime } from '../utils/date'
import { ALLOWED_AVATAR_TYPES } from '../utils/image'

const { t } = useI18n()
const userStore = useUserStore()

/** 源文件大小上限。超过它浏览器压缩会明显卡顿，体验上不如直接拒绝。 */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024

const achievements = ref([])
const doneCount = ref(0)
const capsuleCount = ref(0)
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editVisible = ref(false)
const nicknameDraft = ref('')

/**
 * 成就类型 → 图标与颜色。
 *
 * 键是**存储值**：成就的 `type` 字段就是这三个中文词，它写在 IndexedDB 里、
 * 也随导出备份流转，翻译它会直接破坏已有数据和旧备份。
 * 需要翻译的是显示出来的名字，见下面的 ACHIEVEMENT_KEY 映射。
 */
const META = {
  任务完成: { icon: '✅', color: '#8fa97e' },
  胶囊开启: { icon: '🕐', color: '#d9a05b' },
  连续打卡: { icon: '🔥', color: '#c97c6a' }
}

/** 存储值 → 语言键。分开写是为了让语言键里不出现中文，便于检索与校对。 */
const ACHIEVEMENT_KEY = {
  任务完成: 'taskDone',
  胶囊开启: 'capsuleOpened',
  连续打卡: 'streak'
}

const meta = (type) => META[type] || { icon: '🏅', color: '#a99a8b' }
const achievementLabel = (type) => t(`achievementType.${ACHIEVEMENT_KEY[type] ?? 'unknown'}`)

const load = async () => {
  loading.value = true
  try {
    // 先刷新档案，保证等级 / 连续打卡是最新的（完成任务的闭环会改动它们）
    await userStore.refresh()
    nicknameDraft.value = userStore.nickname

    const [badges, tasks, capsules] = await Promise.all([
      listAchievements(),
      listTasks(),
      listOpenedCapsules()
    ])
    achievements.value = badges
    doneCount.value = tasks.filter((t) => t.status === 1).length
    capsuleCount.value = capsules.length
  } finally {
    loading.value = false
  }
}

const saveNickname = async () => {
  if (!nicknameDraft.value.trim()) {
    ElMessage.warning(t('profile.errNicknameEmpty'))
    return
  }
  saving.value = true
  try {
    await userStore.saveProfile({
      nickname: nicknameDraft.value.trim(),
      avatarUrl: userStore.avatarUrl
    })
    ElMessage.success(t('profile.msgNicknameSaved'))
    editVisible.value = false
  } catch (e) {
    /* 已提示 */
  } finally {
    saving.value = false
  }
}

/**
 * 选图前的本地预检。
 *
 * 真正的类型校验与压缩在 `utils/image.js` 里做，这里只是提前挡掉明显不合规的
 * 文件，省得读进内存再报错。**两处都校验是有意的**：这一层管体验，那一层管安全，
 * 不能因为这里拦过一次就放松底层。
 */
const beforeAvatarUpload = (file) => {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    ElMessage.error(t('profile.errAvatarType'))
    return false
  }
  if (file.size > MAX_SOURCE_BYTES) {
    ElMessage.error(t('profile.errAvatarSize'))
    return false
  }
  return true
}

/** el-upload 的自定义上传：拿到原始 File，交给 store 在本地压缩并落盘 */
const doUploadAvatar = async ({ file }) => {
  uploading.value = true
  try {
    await userStore.changeAvatar(file)
    ElMessage.success(t('profile.msgAvatarSaved'))
  } catch (e) {
    /* 已提示 */
  } finally {
    uploading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.profile-card {
  margin-bottom: var(--sp-4);
}
.profile-top {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}
.profile-main {
  flex: 1;
}
/* 头像：悬浮出现「编辑」提示，点一下打开编辑资料 */
.avatar-trigger {
  position: relative;
  flex-shrink: 0;
  line-height: 0;
  border-radius: 50%;
  cursor: pointer;
}
.avatar-trigger-hint {
  position: absolute;
  inset: auto 0 0 0;
  padding: 2px 0;
  border-radius: 0 0 30px 30px;
  background: rgba(63, 50, 39, 0.62);
  color: #fff;
  font-size: 11px;
  line-height: 1.7;
  text-align: center;
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.avatar-trigger:hover .avatar-trigger-hint {
  opacity: 1;
}
.profile-avatar {
  background: var(--mt-primary-soft);
  color: var(--mt-primary-deep);
  font-size: 18px;
  font-weight: 500;
}

/* 编辑资料弹窗里的头像上传 */
.avatar-uploader {
  line-height: 0;
}
.avatar-edit {
  position: relative;
  overflow: hidden;
  border-radius: 50%;
  line-height: 0;
  cursor: pointer;
}
.avatar-edit-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(63, 50, 39, 0.5);
  color: #fff;
  font-size: var(--fs-xs);
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.avatar-edit:hover .avatar-edit-mask,
.avatar-edit.uploading .avatar-edit-mask {
  opacity: 1;
}
.nickname {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--mt-text);
}
.storage-note {
  margin-top: 3px;
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
}
.stats {
  margin-bottom: var(--sp-4);
}
.level-tip {
  font-size: 12px;
  color: var(--mt-text-muted);
}
.badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
.badge {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--mt-border-soft);
  border-left-width: 3px;
  border-radius: var(--radius);
  background: var(--mt-surface);
}
.badge-icon {
  font-size: 18px;
}
.badge-title {
  font-size: var(--fs-base);
  font-weight: 500;
  color: var(--mt-text);
}
.badge-time {
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
}
</style>
