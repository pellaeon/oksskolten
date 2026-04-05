import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { useI18n } from '../../../lib/i18n'
import { apiPatch, fetcher } from '../../../lib/fetcher'
import {
  DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT,
  FULL_TEXT_BLACKLIST_SETTING_KEY,
} from '../../../../shared/full-text-fetch'

interface Preferences {
  'reading.full_text_blacklist': string | null
}

export function FullTextFetchSection() {
  const { t } = useI18n()
  const { data: prefs, mutate } = useSWR<Preferences>('/api/settings/preferences', fetcher)
  const serverValue = prefs?.[FULL_TEXT_BLACKLIST_SETTING_KEY] ?? DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT
  const [draft, setDraft] = useState(serverValue)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(serverValue)
  }, [serverValue])

  const save = useCallback(async (nextValue: string) => {
    await apiPatch('/api/settings/preferences', {
      [FULL_TEXT_BLACKLIST_SETTING_KEY]: nextValue,
    })
    setSaved(true)
    void mutate()
  }, [mutate])

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), 1500)
    return () => window.clearTimeout(timer)
  }, [saved])

  return (
    <div className="mt-6">
      <p className="text-sm text-text mb-1">{t('settings.fullTextBlacklist')}</p>
      <p className="text-xs text-muted mb-3">{t('settings.fullTextBlacklistDesc')}</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== serverValue) void save(draft)
        }}
        rows={7}
        spellCheck={false}
        className="w-full max-w-xl px-3 py-2 text-sm rounded-lg border border-border bg-bg-card text-text focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setDraft(DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT)
            void save(DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT)
          }}
          className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg border border-border text-text hover:bg-hover transition-colors"
        >
          {t('settings.fullTextBlacklistReset')}
        </button>
        {saved && (
          <span className="text-xs text-accent">{t('settings.fullTextBlacklistSaved')}</span>
        )}
      </div>
      <p className="text-xs text-muted mt-2">{t('settings.fullTextBlacklistHint')}</p>
    </div>
  )
}
