const STORAGE_KEY = 'oksskolten:article-page-navigation'

export interface ArticlePageNavigationContext {
  sourcePath: string
  articleUrls: string[]
}

export function persistArticlePageNavigation(context: ArticlePageNavigationContext | null) {
  if (typeof window === 'undefined') return

  if (!context) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }

  const sourcePath = context.sourcePath.trim()
  const articleUrls = [...new Set(context.articleUrls.filter(Boolean))]

  if (!sourcePath || articleUrls.length === 0) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sourcePath, articleUrls }))
}

export function readArticlePageNavigation(): ArticlePageNavigationContext | null {
  if (typeof window === 'undefined') return null

  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<ArticlePageNavigationContext>
    if (typeof parsed?.sourcePath !== 'string' || !Array.isArray(parsed.articleUrls)) return null

    const articleUrls = parsed.articleUrls.filter((url): url is string => typeof url === 'string' && url.length > 0)
    if (articleUrls.length === 0) return null

    return { sourcePath: parsed.sourcePath, articleUrls }
  } catch {
    return null
  }
}

export function getAdjacentArticleUrl(currentUrl: string, direction: 'next' | 'prev'): string | null {
  const context = readArticlePageNavigation()
  if (!context) return null

  const currentIndex = context.articleUrls.indexOf(currentUrl)
  if (currentIndex === -1) return null

  const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
  return context.articleUrls[targetIndex] ?? null
}
