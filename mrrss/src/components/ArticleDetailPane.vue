<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../../../src/lib/markdown'
import { sanitizeHtml } from '../../../src/lib/sanitize'
import type { ArticleDetail } from '../../../shared/types'

const props = defineProps<{
  article: ArticleDetail | null
  loading: boolean
}>()

const emit = defineEmits<{
  toggleRead: []
  toggleLiked: []
  toggleBookmarked: []
}>()

const renderedContent = computed(() => {
  if (!props.article) return ''
  const body = props.article.full_text || props.article.excerpt || props.article.summary || ''
  if (!body) return '<p class="reader-empty-copy">No article content available.</p>'
  return sanitizeHtml(renderMarkdown(body))
})

const publishedAt = computed(() => {
  if (!props.article?.published_at) return 'Unknown date'
  return new Date(props.article.published_at).toLocaleString()
})

const isRead = computed(() => Boolean(props.article?.read_at || props.article?.seen_at))
</script>

<template>
  <section class="detail-pane">
    <div v-if="loading" class="detail-state">Loading article…</div>
    <div v-else-if="!article" class="detail-state">Select an article to open it here.</div>
    <article v-else class="detail-card">
      <header class="detail-card__header">
        <p class="detail-card__meta">
          <span>{{ article.feed_name }}</span>
          <span>{{ publishedAt }}</span>
        </p>
        <h2>{{ article.title }}</h2>
        <div class="detail-toolbar">
          <button class="detail-action" :class="{ 'is-active': isRead }" type="button" @click="emit('toggleRead')">
            {{ isRead ? 'Mark unread' : 'Mark read' }}
          </button>
          <button class="detail-action" :class="{ 'is-active': Boolean(article.liked_at) }" type="button" @click="emit('toggleLiked')">
            Liked
          </button>
          <button class="detail-action" :class="{ 'is-active': Boolean(article.bookmarked_at) }" type="button" @click="emit('toggleBookmarked')">
            Read Later
          </button>
          <a class="detail-action detail-action--link" :href="article.url" target="_blank" rel="noreferrer">
            Open original
          </a>
        </div>
      </header>

      <div v-if="article.summary" class="detail-summary">
        <h3>Summary</h3>
        <p>{{ article.summary }}</p>
      </div>

      <div class="detail-content prose" v-html="renderedContent" />
    </article>
  </section>
</template>
