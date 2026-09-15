<template>
  <div class="page">
    <div class="page-head">
      <h1 class="page-title">我的 / 成就</h1>
    </div>

    <el-card shadow="never" class="profile-card" v-loading="loading">
      <div class="profile-top">
        <div class="avatar-trigger" title="编辑资料" @click="editVisible = true">
          <el-avatar :size="60" :src="userStore.avatarUrl" class="profile-avatar">
            {{ userStore.avatarText }}
          </el-avatar>
          <span class="avatar-trigger-hint">编辑</span>
        </div>
        <div class="profile-main">
          <div class="nickname">{{ userStore.displayName }}</div>
          <div class="openid">openid：{{ userStore.openid }}</div>
        </div>
        <el-button @click="editVisible = true">编辑资料</el-button>
      </div>

      <div class="stat-grid stats">
        <div class="stat-cell">
          <div class="value">Lv.{{ userStore.growthLevel }}</div>
          <div class="label">成长等级</div>
        </div>
        <div class="stat-cell">
          <div class="value">{{ userStore.streakDays }} 天</div>
          <div class="label">连续打卡</div>
        </div>
        <div class="stat-cell">
          <div class="value">{{ doneCount }}</div>
          <div class="label">已完成任务</div>
        </div>
        <div class="stat-cell">
          <div class="value">{{ capsuleCount }}</div>
          <div class="label">已开启胶囊</div>
        </div>
      </div>

      <div class="level-tip">
        每完成 5 个任务升 1 级，当前进度 {{ doneCount % 5 }}/5
        <el-progress :percentage="(doneCount % 5) * 20" :show-text="false" :stroke-width="6" />
      </div>
    </el-card>

    <el-card shadow="never" class="switch-card">
      <div class="switch-row">
        <span class="switch-label">切换测试账号</span>
        <el-select v-model="currentOpenid" style="width: 240px" @change="switchAccount">
          <el-option
            v-for="account in accounts"
            :key="account.openid"
            :label="account.label"
            :value="account.openid"
          />
        </el-select>
        <span class="switch-tip">数据库脚本预置了 3 个账号，数据各自独立，可用来验证数据隔离</span>
      </div>
    </el-card>

    <h3>成就徽章（{{ achievements.length }}）</h3>
    <el-empty v-if="achievements.length === 0" description="完成更多任务，解锁第一个徽章吧" />
    <div v-else class="badge-list">
      <div v-for="a in achievements" :key="a.id" class="badge" :style="{ borderColor: meta(a.type).color }">
        <span class="badge-icon">{{ meta(a.type).icon }}</span>
        <div>
          <div class="badge-title">{{ a.type }} × {{ a.value }}</div>
          <div class="badge-time">{{ formatDateTime(a.unlockedAt) }} 解锁</div>
        </div>
      </div>
    </div>

    <!-- 编辑资料：头像上传 + 昵称 -->
    <el-dialog v-model="editVisible" title="编辑资料" width="460px">
      <el-form label-width="70px">
        <el-form-item label="头像">
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
              <div class="avatar-edit-mask">{{ uploading ? '上传中…' : '更换头像' }}</div>
            </div>
          </el-upload>
          <div class="form-hint">
            支持 JPG / PNG / WebP / GIF，单张不超过 5 MB。选好图片即上传，不需要再点保存。
          </div>
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="nicknameDraft" maxlength="50" placeholder="给自己起个名字" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveNickname">保存昵称</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listAchievements } from '../api/achievement'
import { listOpenedCapsules } from '../api/capsule'
import { listTasks } from '../api/task'
import { uploadAvatar } from '../api/user'
import { useUserStore } from '../stores/user'
import { formatDateTime } from '../utils/date'

const userStore = useUserStore()

const accounts = [
  { openid: 'test-openid-001', label: '小林（数据最全）' },
  { openid: 'test-openid-002', label: '阿May' },
  { openid: 'test-openid-003', label: '老王（刚注册）' }
]

const achievements = ref([])
const doneCount = ref(0)
const capsuleCount = ref(0)
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editVisible = ref(false)
const nicknameDraft = ref('')
const currentOpenid = ref(userStore.openid)

const META = {
  任务完成: { icon: '✅', color: '#8fa97e' },
  胶囊开启: { icon: '🕐', color: '#d9a05b' },
  连续打卡: { icon: '🔥', color: '#c97c6a' }
}
const meta = (type) => META[type] || { icon: '🏅', color: '#a99a8b' }

const load = async () => {
  loading.value = true
  try {
    // 拉一次用户信息，保证等级 / 打卡是最新的
    await userStore.refresh()
    currentOpenid.value = userStore.openid
    nicknameDraft.value = userStore.nickname

    const [badges, tasks, capsules] = await Promise.all([
      listAchievements(userStore.userId),
      listTasks(userStore.userId),
      listOpenedCapsules(userStore.userId)
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
    ElMessage.warning('昵称不能为空')
    return
  }
  saving.value = true
  try {
    await userStore.saveProfile({ nickname: nicknameDraft.value.trim(), avatarUrl: userStore.avatarUrl })
    ElMessage.success('昵称已更新')
    editVisible.value = false
  } catch (e) {
    /* 已提示 */
  } finally {
    saving.value = false
  }
}

/**
 * 选图前的本地预检：先挡掉明显不合规的文件，省一次往返。
 * 服务端还会再校验一次（MIME 类型 + 大小），这里只是让反馈更快。
 */
const beforeAvatarUpload = (file) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    ElMessage.error('只支持 JPG / PNG / WebP / GIF 格式的图片')
    return false
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('图片不能超过 5 MB')
    return false
  }
  return true
}

/** el-upload 的自定义上传：拿到原始 File 自己发请求，走统一的 request 封装 */
const doUploadAvatar = async ({ file }) => {
  uploading.value = true
  try {
    const user = await uploadAvatar(userStore.userId, userStore.userId, file)
    // setUser 会同时更新 localStorage，侧边栏头像也跟着变
    userStore.setUser(user)
    ElMessage.success('头像已更新')
  } catch (e) {
    /* 错误提示已由 request 拦截器统一弹出 */
  } finally {
    uploading.value = false
  }
}

const switchAccount = async (openid) => {
  try {
    await userStore.switchOpenid(openid)
    ElMessage.success(`已切换到 ${userStore.displayName}`)
    await load()
  } catch (e) {
    /* 已提示 */
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
.openid {
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
.switch-card {
  margin-bottom: var(--sp-5);
}
.switch-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.switch-label {
  font-size: var(--fs-base);
  color: var(--mt-text-sub);
}
.switch-tip {
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
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
