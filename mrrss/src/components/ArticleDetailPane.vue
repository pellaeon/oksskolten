<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../../../src/lib/markdown'
import { sanitizeHtml } from '../../../src/lib/sanitize'
import type { ArticleDetail } from '../../../shared/types'

const props = defineProps<{
  article: ArticleDetail | null
  loading: boolean
  summarizing?: boolean
  translating?: boolean
  archiving?: boolean
}>()

const emit = defineEmits<{
  toggleRead: []
  toggleLiked: []
  toggleBookmarked: []
  summarize: []
  translate: []
  archiveImages: []
}>()

const renderedContent = computed(() => {
  if (!props.article) return ''
  const body = props.article.full_text_translated || props.article.full_text || props.article.excerpt || props.article.summary || ''
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
    <div v-if="loading" class="detail-empty-state">Loading article…</div>
    <div v-else-if="!article" class="detail-empty-state">
      <svg class="detail-empty-state__icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="6" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M8 10h6M8 13h6" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M18 9h2v10H6v-1" fill="none" stroke="currentColor" stroke-width="1.6" />
      </svg>
      <p>Select an article to start reading</p>
    </div>
    <article v-else class="detail-surface">
      <header class="detail-surface__header">
        <p class="detail-surface__meta">
          <span>{{ article.feed_name }}</span>
          <span>{{ publishedAt }}</span>
        </p>
        <h2>{{ article.title }}</h2>
        <div class="detail-toolbar">
          <button
            class="detail-action detail-action--icon"
            :class="{ 'is-active': isRead }"
            type="button"
            :title="isRead ? 'Mark unread' : 'Mark read'"
            :aria-label="isRead ? 'Mark unread' : 'Mark read'"
            @click="emit('toggleRead')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M12 8v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button
            class="detail-action detail-action--icon"
            :class="{ 'is-active': Boolean(article.liked_at) }"
            type="button"
            title="Liked"
            aria-label="Liked"
            @click="emit('toggleLiked')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 4 2.5 5.2 5.7.8-4.1 4 1 5.8L12 17l-5.1 2.8 1-5.8-4.1-4 5.7-.8z" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button
            class="detail-action detail-action--icon"
            :class="{ 'is-active': Boolean(article.bookmarked_at) }"
            type="button"
            title="Read Later"
            aria-label="Read Later"
            @click="emit('toggleBookmarked')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 4h10v16l-5-3-5 3z" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button class="detail-action" type="button" :disabled="summarizing" @click="emit('summarize')">
            {{ summarizing ? 'Summarizing…' : article.summary ? 'Refresh summary' : 'Summarize' }}
          </button>
          <button class="detail-action" type="button" :disabled="translating" @click="emit('translate')">
            {{ translating ? 'Translating…' : article.full_text_translated ? 'Refresh translation' : 'Translate' }}
          </button>
          <button
            v-if="article.imageArchivingEnabled"
            class="detail-action"
            type="button"
            :disabled="archiving || Boolean(article.images_archived_at)"
            @click="emit('archiveImages')"
          >
            {{ article.images_archived_at ? 'Images archived' : archiving ? 'Archiving…' : 'Archive images' }}
          </button>
          <a class="detail-action detail-action--link detail-action--icon" :href="article.url" title="Open original" aria-label="Open original" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5M10 14l9-9" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M19 14v5H5V5h5" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
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
