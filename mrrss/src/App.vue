<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LoginView from '@mrrss/components/LoginView.vue'
import ReaderShell from '@mrrss/components/ReaderShell.vue'
import { getSession } from '@mrrss/lib/api'
import { getAuthToken, setAuthToken } from '@mrrss/lib/auth'

const checking = ref(true)
const userEmail = ref('')

onMounted(async () => {
  await loadSession()
})

async function loadSession() {
  checking.value = true
  try {
    const session = await getSession()
    userEmail.value = session.email
  } catch {
    userEmail.value = ''
    setAuthToken(null)
  } finally {
    checking.value = false
  }
}

async function handleAuthenticated(token: string) {
  setAuthToken(token)
  await loadSession()
}

function handleLogout() {
  setAuthToken(null)
  userEmail.value = ''
}

const hasToken = () => Boolean(getAuthToken())
</script>

<template>
  <div class="app-root">
    <div v-if="checking" class="boot-screen">Checking session…</div>
    <LoginView v-else-if="!userEmail && !hasToken()" @authenticated="handleAuthenticated" />
    <LoginView v-else-if="!userEmail" @authenticated="handleAuthenticated" />
    <ReaderShell v-else :email="userEmail" @logout="handleLogout" />
  </div>
</template>
