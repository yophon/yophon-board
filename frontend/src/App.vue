<template>
  <main class="board-shell">
    <header class="board-topbar">
      <div class="board-brand">
        <span class="board-dot" />
        <div class="project-switcher">
          <button class="project-trigger" type="button" @click="projectsOpen = !projectsOpen">
            <span>{{ projectTitle }}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <p>/{{ projectSlug }}</p>
          <div v-if="projectsOpen" class="project-menu">
            <button
              v-for="project in projects"
              :key="project.slug"
              class="project-menu-item"
              :class="{ active: project.slug === projectSlug }"
              type="button"
              @click="goToProject(project.slug)"
            >
              <span>{{ project.title }}</span>
              <small>/{{ project.slug }}</small>
            </button>
            <button
              v-if="authStore.authed"
              class="project-menu-create"
              type="button"
              @click="openCreateProject"
            >
              新建项目
            </button>
            <button
              v-else
              class="project-menu-create muted"
              type="button"
              @click="loginOpen = true; projectsOpen = false"
            >
              登录后新建项目
            </button>
          </div>
        </div>
      </div>
      <div class="board-actions">
        <button class="text-btn" type="button" @click="copyProjectLink">复制链接</button>
        <button v-if="authStore.authed" class="text-btn danger" type="button" @click="authStore.logout()">退出管理</button>
        <button v-else class="text-btn" type="button" @click="loginOpen = true">管理</button>
      </div>
    </header>

    <section class="board-stage">
      <WhiteboardCanvas :board-slug="projectSlug" />
    </section>

    <div v-if="toast" class="app-toast">{{ toast }}</div>

    <div v-if="loginOpen" class="modal-scrim" @click.self="loginOpen = false">
      <form class="login-panel" @submit.prevent="login">
        <h2>管理白板</h2>
        <input
          v-model="password"
          type="password"
          placeholder="管理员密码"
          autocomplete="current-password"
          autofocus
        />
        <p v-if="loginError">{{ loginError }}</p>
        <div class="login-actions">
          <button type="button" class="text-btn" @click="loginOpen = false">取消</button>
          <button type="submit" class="text-btn primary">登录</button>
        </div>
      </form>
    </div>

    <div v-if="createProjectOpen" class="modal-scrim" @click.self="createProjectOpen = false">
      <form class="login-panel" @submit.prevent="createProject">
        <h2>新建项目</h2>
        <input
          v-model="newProjectTitle"
          type="text"
          placeholder="项目名称"
          autocomplete="off"
          autofocus
          @input="syncProjectSlug"
        />
        <input
          v-model="newProjectSlug"
          type="text"
          placeholder="project-slug"
          autocomplete="off"
          @input="slugTouched = true"
        />
        <p v-if="createProjectError">{{ createProjectError }}</p>
        <div class="login-actions">
          <button type="button" class="text-btn" @click="createProjectOpen = false">取消</button>
          <button type="submit" class="text-btn primary">创建</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WhiteboardCanvas from './components/WhiteboardCanvas.vue'
import { useAuthStore } from './stores/auth'

interface Project {
  id: number
  slug: string
  title: string
  visibility: string
  created_at: number
}

const authStore = useAuthStore()
const loginOpen = ref(false)
const createProjectOpen = ref(false)
const projectsOpen = ref(false)
const password = ref('')
const loginError = ref('')
const createProjectError = ref('')
const toast = ref('')
const projectTitle = ref('Yophon Board')
const projects = ref<Project[]>([])
const newProjectTitle = ref('')
const newProjectSlug = ref('')
const slugTouched = ref(false)

const projectSlug = computed(() => {
  const path = window.location.pathname
  const match = path.match(/^\/(?:p|b)\/([^/]+)/)
  const slug = match ? decodeURIComponent(match[1]) : new URLSearchParams(window.location.search).get('project') || new URLSearchParams(window.location.search).get('board')
  return normalizeSlug(slug || 'main')
})

function normalizeSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'main'
}

function projectSlugFromTitle(title: string) {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return slug || `project-${Date.now().toString(36)}`
}

function showToast(message: string) {
  toast.value = message
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, 1600)
}

async function loadProject() {
  try {
    const res = await fetch(`/api/projects/${projectSlug.value}`)
    const project = await res.json()
    projectTitle.value = project.title || 'Yophon Board'
  } catch {
    projectTitle.value = 'Yophon Board'
  }
}

async function loadProjects() {
  try {
    const res = await fetch('/api/projects')
    projects.value = await res.json()
    if (!projects.value.some(project => project.slug === projectSlug.value)) {
      await loadProject()
      projects.value = [{ id: 0, slug: projectSlug.value, title: projectTitle.value, visibility: 'public', created_at: 0 }, ...projects.value]
    }
  } catch {
    projects.value = []
  }
}

async function copyProjectLink() {
  const url = new URL(window.location.href)
  url.pathname = `/p/${projectSlug.value}`
  url.searchParams.delete('board')
  url.searchParams.delete('project')
  url.searchParams.delete('page')
  try {
    await navigator.clipboard.writeText(url.toString())
    showToast('链接已复制')
  } catch {
    showToast('复制失败')
  }
}

function goToProject(slug: string) {
  projectsOpen.value = false
  if (slug === projectSlug.value) return
  window.location.href = `/p/${slug}`
}

function openCreateProject() {
  projectsOpen.value = false
  createProjectError.value = ''
  newProjectTitle.value = ''
  newProjectSlug.value = ''
  slugTouched.value = false
  createProjectOpen.value = true
}

function syncProjectSlug() {
  if (slugTouched.value && newProjectSlug.value) return
  newProjectSlug.value = projectSlugFromTitle(newProjectTitle.value)
}

async function createProject() {
  createProjectError.value = ''
  const title = newProjectTitle.value.trim()
  const slug = normalizeSlug(newProjectSlug.value || projectSlugFromTitle(title))
  if (!title) {
    createProjectError.value = '请输入项目名称'
    return
  }
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, slug }),
    })
    if (!res.ok) {
      createProjectError.value = res.status === 400 ? '项目标识已存在或不合法' : '创建失败'
      return
    }
    const project = await res.json()
    window.location.href = `/p/${project.slug}`
  } catch {
    createProjectError.value = '创建失败'
  }
}

async function login() {
  loginError.value = ''
  const ok = await authStore.login(password.value)
  if (!ok) {
    loginError.value = '密码错误'
    return
  }
  password.value = ''
  loginOpen.value = false
  await loadProjects()
}

onMounted(async () => {
  await authStore.check()
  await loadProject()
  await loadProjects()
})
</script>
