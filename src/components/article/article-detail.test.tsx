import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, useLocation, useParams } from 'react-router-dom'
import { SWRConfig } from 'swr'
import { LocaleContext } from '../../lib/i18n'
import { TooltipProvider } from '../ui/tooltip'
import { DEFAULT_KEY_BINDINGS } from '../../../shared/keyboard-shortcuts'
import { persistArticlePageNavigation } from '../../lib/article-page-navigation'
import { articleUrlToPath } from '../../lib/url'

const { mockApiPatch, mockApiPost, mockTrackRead, mockUntrackRead, mockQueueSeenIds } = vi.hoisted(() => ({
  mockApiPatch: vi.fn(),
  mockApiPost: vi.fn(() => Promise.resolve()),
  mockTrackRead: vi.fn(),
  mockUntrackRead: vi.fn(),
  mockQueueSeenIds: vi.fn((_ids: number[]) => Promise.resolve()),
}))

vi.mock('../../lib/fetcher', async () => {
  const actual = await vi.importActual<typeof import('../../lib/fetcher')>('../../lib/fetcher')
  return {
    ...actual,
    apiPatch: mockApiPatch,
    apiPost: mockApiPost,
  }
})

vi.mock('../../lib/readTracker', () => ({
  trackRead: (...args: unknown[]) => mockTrackRead(...args),
  untrackRead: (...args: unknown[]) => mockUntrackRead(...args),
}))

vi.mock('../../lib/offlineQueue', () => ({
  queueSeenIds: (ids: number[]) => mockQueueSeenIds(ids),
}))

vi.mock('../../hooks/use-rewrite-internal-links', () => ({
  useRewriteInternalLinks: (html: string) => ({ rewrittenHtml: html }),
}))

vi.mock('../../hooks/use-metrics', () => ({
  useMetrics: () => ({ metrics: null, report: vi.fn(), reset: vi.fn(), formatMetrics: vi.fn(() => null) }),
}))

vi.mock('../../hooks/use-summarize', () => ({
  useSummarize: () => ({
    summary: null,
    summarizing: false,
    streamingText: '',
    handleSummarize: vi.fn(),
    summaryHtml: '',
    streamingHtml: '',
    error: null,
  }),
}))

const mockUseTranslate = vi.fn((_article?: { id: number; full_text_translated: string | null }, _metrics?: unknown) => ({
  viewMode: 'original' as const,
  setViewMode: vi.fn(),
  translating: false,
  translatingText: '',
  fullTextTranslated: null,
  handleTranslate: vi.fn(),
  translatingHtml: '',
  error: null,
}))

vi.mock('../../hooks/use-translate', () => ({
  useTranslate: (...args: Parameters<typeof mockUseTranslate>) => mockUseTranslate(...args),
}))

vi.mock('../ui/ImageLightbox', () => ({
  ImageLightbox: () => null,
}))

vi.mock('../chat/chat-fab', () => ({
  ChatFab: () => null,
}))

import { ArticleDetail } from './article-detail'

const mockSettings = {
  internalLinks: 'on' as const,
  colorMode: 'system' as const,
  setColorMode: vi.fn(),
  themeName: 'default',
  setTheme: vi.fn(),
  themes: [{ name: 'default', label: 'Default' }],
  dateMode: 'relative' as const,
  setDateMode: vi.fn(),
  autoMarkRead: 'off' as const,
  setAutoMarkRead: vi.fn(),
  showUnreadIndicator: 'on' as const,
  setShowUnreadIndicator: vi.fn(),
  indicatorStyle: 'dot' as const,
  showThumbnails: 'on' as const,
  setShowThumbnails: vi.fn(),
  showFeedActivity: 'on' as const,
  setShowFeedActivity: vi.fn(),
  chatPosition: 'fab' as const,
  setChatPosition: vi.fn(),
  translateTargetLang: null as any,
  setTranslateTargetLang: vi.fn(),
  keyboardNavigation: 'on' as const,
  setKeyboardNavigation: vi.fn(),
  keybindings: DEFAULT_KEY_BINDINGS,
  setKeybindings: vi.fn(),
  highlightTheme: 'github-dark' as const,
  setHighlightTheme: vi.fn(),
  articleFont: 'sans' as const,
  setArticleFont: vi.fn(),
  save: vi.fn(),
}

function OutletWrapper() {
  return <Outlet context={{ settings: mockSettings, sidebarOpen: false, setSidebarOpen: vi.fn() }} />
}

function RoutedArticleDetail() {
  const { '*': splat } = useParams()
  if (!splat) return null
  const articleUrl = `https://${decodeURIComponent(splat)}`
  return <ArticleDetail articleUrl={articleUrl} />
}

function PathnameProbe() {
  const location = useLocation()
  return <div data-testid="pathname">{location.pathname}</div>
}

describe('ArticleDetail bookmark', () => {
  const articleUrl = 'https://example.com/posts/1'
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`
  const article = {
    id: 1,
    feed_id: 2,
    feed_name: 'Example Feed',
    title: 'Example Article',
    url: articleUrl,
    published_at: '2026-03-04T00:00:00.000Z',
    lang: 'en',
    summary: null,
    full_text: 'Body',
    full_text_translated: null,
    translated_lang: null,
    seen_at: '2026-03-04T00:00:00.000Z',
    read_at: '2026-03-04T00:00:00.000Z',
    bookmarked_at: null,
    liked_at: null,
  }

  beforeEach(() => {
    mockApiPatch.mockReset()
    mockApiPatch.mockResolvedValue({ bookmarked_at: '2026-03-05T00:00:00.000Z' })
    mockApiPost.mockReset()
    mockApiPost.mockResolvedValue(undefined)
    mockTrackRead.mockReset()
    mockQueueSeenIds.mockClear()
  })

  it('updates the bookmark button immediately after click', async () => {
    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'ja', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    const buttons = screen.getAllByRole('button', { pressed: false })
    // First aria-pressed button is bookmark, second is like
    const bookmarkBtn = buttons[0]
    const icon = bookmarkBtn.querySelector('svg')
    expect(icon?.getAttribute('fill')).toBe('none')

    fireEvent.click(bookmarkBtn)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
    })
    expect(bookmarkBtn.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
    expect(mockApiPatch).toHaveBeenCalledWith('/api/articles/1/bookmark', { bookmarked: true })
  })
})

describe('ArticleDetail like', () => {
  const articleUrl = 'https://example.com/posts/1'
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`
  const article = {
    id: 1,
    feed_id: 2,
    feed_name: 'Example Feed',
    title: 'Example Article',
    url: articleUrl,
    published_at: '2026-03-04T00:00:00.000Z',
    lang: 'en',
    summary: null,
    full_text: 'Body',
    full_text_translated: null,
    translated_lang: null,
    seen_at: '2026-03-04T00:00:00.000Z',
    read_at: '2026-03-04T00:00:00.000Z',
    bookmarked_at: null,
    liked_at: null,
  }

  beforeEach(() => {
    mockApiPatch.mockReset()
    mockApiPatch.mockResolvedValue({ liked_at: '2026-03-05T00:00:00.000Z' })
    mockApiPost.mockReset()
    mockApiPost.mockResolvedValue(undefined)
    mockTrackRead.mockReset()
    mockQueueSeenIds.mockClear()
  })

  beforeEach(() => {
    mockUseTranslate.mockClear()
  })

  it('updates the like button immediately after click', async () => {
    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'ja', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    const buttons = screen.getAllByRole('button', { pressed: false })
    // First aria-pressed button is bookmark, second is like
    const likeBtn = buttons[1]
    const icon = likeBtn.querySelector('svg')
    expect(icon?.getAttribute('fill')).toBe('none')

    fireEvent.click(likeBtn)

    await waitFor(() => {
      const pressedButtons = screen.getAllByRole('button', { pressed: true })
      expect(pressedButtons).toHaveLength(1)
    })
    expect(likeBtn.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
    expect(mockApiPatch).toHaveBeenCalledWith('/api/articles/1/like', { liked: true })
  })

})

describe('ArticleDetail stale translation filtering', () => {
  const articleUrl = 'https://example.com/posts/1'
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`

  beforeEach(() => {
    mockApiPatch.mockReset()
    mockApiPost.mockReset()
    mockApiPost.mockResolvedValue(undefined)
    mockTrackRead.mockReset()
    mockQueueSeenIds.mockClear()
    mockUseTranslate.mockClear()
  })

  it('passes full_text_translated: null when translated_lang does not match locale', () => {
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'fr',
      summary: null,
      full_text: 'Contenu français',
      full_text_translated: '古い日本語訳',
      translated_lang: 'ja',
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    // translated_lang='ja' but locale='en' → stale, should pass null
    expect(mockUseTranslate).toHaveBeenCalled()
    const firstArg = mockUseTranslate.mock.calls[0]![0]
    expect(firstArg).toEqual({ id: 1, full_text_translated: null })
  })

  it('passes full_text_translated when translated_lang matches locale', () => {
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'fr',
      summary: null,
      full_text: 'Contenu français',
      full_text_translated: '日本語訳',
      translated_lang: 'ja',
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'ja', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    // translated_lang='ja' and locale='ja' → current, should pass the translation
    expect(mockUseTranslate).toHaveBeenCalled()
    const firstArg = mockUseTranslate.mock.calls[0]![0]
    expect(firstArg).toEqual({ id: 1, full_text_translated: '日本語訳' })
  })

  it('passes full_text_translated: null when translated_lang is null', () => {
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'fr',
      summary: null,
      full_text: 'Contenu français',
      full_text_translated: 'legacy translation',
      translated_lang: null,
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'ja', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    // translated_lang=null (legacy) → stale, should pass null
    expect(mockUseTranslate).toHaveBeenCalled()
    const firstArg = mockUseTranslate.mock.calls[0]![0]
    expect(firstArg).toEqual({ id: 1, full_text_translated: null })
  })
})

describe('ArticleDetail read shortcut', () => {
  const articleUrl = 'https://example.com/posts/1'
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`

  beforeEach(() => {
    window.sessionStorage.clear()
    mockApiPatch.mockReset()
    mockApiPatch.mockResolvedValue({ seen_at: null, read_at: null })
    mockApiPost.mockReset()
    mockApiPost.mockImplementation(() => Promise.resolve({ seen_at: '2026-03-04T00:00:00.000Z', read_at: '2026-03-04T00:00:00.000Z' } as any))
    mockTrackRead.mockReset()
    mockQueueSeenIds.mockClear()
  })

  it('toggles back to unread after the mount-time read sync updates local state', async () => {
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'en',
      summary: null,
      full_text: 'Body',
      full_text_translated: null,
      translated_lang: null,
      seen_at: null,
      read_at: null,
      bookmarked_at: null,
      liked_at: null,
    }

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/articles/1/read')
    })

    fireEvent.keyDown(document, { key: 'r' })

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/articles/1/seen', { seen: false })
    })
  })

  it('navigates to the next article with J in full-page mode', async () => {
    const nextUrl = 'https://example.com/posts/2'
    const nextKey = `/api/articles/by-url?url=${encodeURIComponent(nextUrl)}`
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'en',
      summary: null,
      full_text: 'Body',
      full_text_translated: null,
      translated_lang: null,
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }
    const nextArticle = { ...article, id: 2, url: nextUrl, title: 'Next Article' }

    persistArticlePageNavigation({
      sourcePath: '/inbox',
      articleUrls: [articleUrl, nextUrl],
    })

    render(
      <MemoryRouter initialEntries={[articleUrlToPath(articleUrl)]}>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article, [nextKey]: nextArticle } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="/inbox" element={<PathnameProbe />} />
                  <Route path="/*" element={<><RoutedArticleDetail /><PathnameProbe /></>} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    fireEvent.keyDown(document, { key: 'j' })

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe(articleUrlToPath(nextUrl))
    })
  })

  it('navigates to the previous article with K in full-page mode', async () => {
    const prevUrl = 'https://example.com/posts/0'
    const prevKey = `/api/articles/by-url?url=${encodeURIComponent(prevUrl)}`
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'en',
      summary: null,
      full_text: 'Body',
      full_text_translated: null,
      translated_lang: null,
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }
    const prevArticle = { ...article, id: 3, url: prevUrl, title: 'Previous Article' }

    persistArticlePageNavigation({
      sourcePath: '/inbox',
      articleUrls: [prevUrl, articleUrl],
    })

    render(
      <MemoryRouter initialEntries={[articleUrlToPath(articleUrl)]}>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article, [prevKey]: prevArticle } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="/inbox" element={<PathnameProbe />} />
                  <Route path="/*" element={<><RoutedArticleDetail /><PathnameProbe /></>} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    fireEvent.keyDown(document, { key: 'k' })

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe(articleUrlToPath(prevUrl))
    })
  })

  it('returns to the source list with Escape in full-page mode', async () => {
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'en',
      summary: null,
      full_text: 'Body',
      full_text_translated: null,
      translated_lang: null,
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }

    persistArticlePageNavigation({
      sourcePath: '/inbox',
      articleUrls: [articleUrl],
    })

    render(
      <MemoryRouter initialEntries={[articleUrlToPath(articleUrl)]}>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="/inbox" element={<PathnameProbe />} />
                  <Route path="/*" element={<><RoutedArticleDetail /><PathnameProbe /></>} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/inbox')
    })
  })
})
