<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getAuthMethods, login, setup, type AuthMethods } from '@mrrss/lib/api'

const emit = defineEmits<{
  authenticated: [token: string]
}>()

const methods = ref<AuthMethods | null>(null)
const loadingMethods = ref(true)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const error = ref('')

const setupMode = computed(() => methods.value?.setup_required === true)

onMounted(async () => {
  try {
    methods.value = await getAuthMethods()
  } catch {
    methods.value = { setup_required: false, password: { enabled: true } }
  } finally {
    loadingMethods.value = false
  }
})

async function submit() {
  error.value = ''

  if (!email.value || !password.value) {
    error.value = 'Email and password are required.'
    return
  }

  if (setupMode.value) {
    if (password.value.length < 8) {
      error.value = 'Password must be at least 8 characters.'
      return
    }
    if (password.value !== confirmPassword.value) {
      error.value = 'Passwords do not match.'
      return
    }
  }

  submitting.value = true
  try {
    const data = setupMode.value
      ? await setup(email.value.trim(), password.value)
      : await login(email.value.trim(), password.value)
    emit('authenticated', data.token)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Authentication failed.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-brand">
        <span class="auth-brand__kicker">Alternative Frontend</span>
        <h1>Oksskolten Reader</h1>
        <p>MrRSS-style layout on top of the existing Oksskolten backend.</p>
      </div>

      <div v-if="loadingMethods" class="auth-state">Checking authentication…</div>

      <form v-else class="auth-form" @submit.prevent="submit">
        <div class="auth-field">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" autocomplete="email" required />
        </div>

        <div class="auth-field">
          <label for="password">{{ setupMode ? 'Create password' : 'Password' }}</label>
          <input id="password" v-model="password" type="password" :autocomplete="setupMode ? 'new-password' : 'current-password'" required />
        </div>

        <div v-if="setupMode" class="auth-field">
          <label for="confirm">Confirm password</label>
          <input id="confirm" v-model="confirmPassword" type="password" autocomplete="new-password" required />
        </div>

        <button class="auth-submit" type="submit" :disabled="submitting">
          {{ submitting ? 'Working…' : setupMode ? 'Create account' : 'Sign in' }}
        </button>

        <p v-if="setupMode" class="auth-hint">
          This instance has no account yet. The first password login creates the owner account.
        </p>
        <p v-else class="auth-hint">
          Password authentication only in this phase. Passkeys and GitHub OAuth stay in the existing frontend.
        </p>

        <p v-if="error" class="auth-error">{{ error }}</p>
      </form>
    </div>
  </div>
</template>
