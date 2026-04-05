import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { fetcher, apiPatch, apiPost } from '../../../lib/fetcher'
import { useI18n, type TranslateFn } from '../../../lib/i18n'

interface FreshRssSettings {
  enabled: boolean
  endpointUrl: string | null
  configured: boolean
  apiKeyConfigured: boolean
  lastSyncAt: string | null
  lastSyncError: string | null
}

function summarizeSyncResult(result: Record<string, unknown>, t: TranslateFn): string {
  return t('integration.freshrssSyncResult', {
    createdFeeds: String(result.createdFeeds ?? 0),
    updatedFeeds: String(result.updatedFeeds ?? 0),
    createdCategories: String(result.createdCategories ?? 0),
    updatedCategories: String(result.updatedCategories ?? 0),
  })
}

export function FreshRssSection() {
  const { t } = useI18n()
  const { data, mutate } = useSWR<FreshRssSettings>('/api/settings/freshrss', fetcher, { revalidateOnFocus: false })
  const [endpointUrl, setEndpointUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState<'save-endpoint' | 'save-key' | 'delete-key' | 'verify' | 'sync' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setEndpointUrl(data?.endpointUrl ?? '')
  }, [data?.endpointUrl])

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    window.setTimeout(() => setMessage(null), 4000)
  }

  async function handleSaveEndpoint() {
    setBusy('save-endpoint')
    try {
      const next = await apiPatch('/api/settings/freshrss', { endpointUrl })
      await mutate(next, { revalidate: false })
      showMessage('success', t('integration.freshrssEndpointSaved'))
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : t('settings.save'))
    } finally {
      setBusy(null)
    }
  }

  async function handleToggleEnabled(enabled: boolean) {
    try {
      const next = await apiPatch('/api/settings/freshrss', { enabled })
      await mutate(next, { revalidate: false })
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : t('integration.freshrssSyncDisabled'))
    }
  }

  async function handleSaveApiKey() {
    setBusy('save-key')
    try {
      const next = await apiPost('/api/settings/freshrss/api-key', { apiKey })
      setApiKey('')
      await mutate(next, { revalidate: false })
      showMessage('success', t('integration.freshrssApiKeySaved'))
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : t('chat.apiKeySaved'))
    } finally {
      setBusy(null)
    }
  }

  async function handleDeleteApiKey() {
    setBusy('delete-key')
    try {
      const next = await apiPost('/api/settings/freshrss/api-key', { apiKey: '' })
      await mutate(next, { revalidate: false })
      showMessage('success', t('integration.freshrssApiKeyDeleted'))
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : t('chat.apiKeyDelete'))
    } finally {
      setBusy(null)
    }
  }

  async function handleVerify() {
    setBusy('verify')
    try {
      await apiPost('/api/settings/freshrss/verify')
      showMessage('success', t('integration.freshrssVerifySuccess'))
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : t('integration.freshrssVerify'))
    } finally {
      setBusy(null)
    }
  }

  async function handleSync() {
    setBusy('sync')
    try {
      const result = await apiPost('/api/settings/freshrss/sync') as Record<string, unknown>
      const nextSettings = result.settings as FreshRssSettings | undefined
      if (nextSettings) {
        await mutate(nextSettings, { revalidate: false })
      } else {
        await mutate()
      }
      showMessage('success', summarizeSyncResult(result, t))
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : t('integration.freshrssSyncNow'))
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  const configured = !!data?.configured
  const enabled = !!data?.enabled

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('integration.freshrss')}</h2>
        <p className="text-xs text-muted mb-4">{t('integration.freshrssDesc')}</p>
        <div className="p-3 rounded-lg bg-bg-card border border-border space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full shrink-0 ${configured ? 'bg-success' : 'bg-warning'}`} />
            <span className="font-medium text-text">{t('integration.freshrssStatus')}</span>
            <span className="text-muted">
              {configured ? t('integration.freshrssConfigured') : t('integration.freshrssNotConfigured')}
            </span>
          </div>

          <FormField label={t('integration.freshrssEndpoint')} hint={t('integration.freshrssEndpointDesc')}>
            <div className="flex items-center gap-2">
              <Input
                value={endpointUrl}
                onChange={event => setEndpointUrl(event.target.value)}
                placeholder="http://127.0.0.1:9080/api/fever.php"
                className="flex-1"
              />
              <button
                type="button"
                onClick={handleSaveEndpoint}
                disabled={busy === 'save-endpoint'}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none"
              >
                {busy === 'save-endpoint' ? '...' : t('settings.save')}
              </button>
            </div>
          </FormField>

          <FormField label={t('integration.freshrssApiKey')} hint={t('integration.freshrssApiKeyDesc')}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={event => setApiKey(event.target.value)}
                  placeholder="0123456789abcdef0123456789abcdef"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={!apiKey || busy === 'save-key'}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none"
                >
                  {busy === 'save-key' ? '...' : t('settings.save')}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{data?.apiKeyConfigured ? t('integration.freshrssApiKeyConfigured') : t('integration.freshrssApiKeyMissing')}</span>
                {data?.apiKeyConfigured && (
                  <button
                    type="button"
                    onClick={handleDeleteApiKey}
                    disabled={busy === 'delete-key'}
                    className="px-2.5 py-1 rounded-lg border border-border hover:bg-hover transition-colors text-muted hover:text-text disabled:opacity-50"
                  >
                    {t('chat.apiKeyDelete')}
                  </button>
                )}
              </div>
            </div>
          </FormField>

          <FormField label={t('integration.freshrssSyncToggle')} hint={t('integration.freshrssSyncToggleDesc')}>
            <div className="flex rounded-md bg-bg-subtle p-0.5">
              {([
                { value: true, label: t('settings.keyboardNavigationOn') },
                { value: false, label: t('settings.keyboardNavigationOff') },
              ] as const).map(option => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => handleToggleEnabled(option.value)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors select-none ${
                    enabled === option.value
                      ? 'bg-accent text-accent-text font-medium shadow-sm'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FormField>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={!configured || busy === 'verify'}
              className="px-3 py-2 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50"
            >
              {busy === 'verify' ? '...' : t('integration.freshrssVerify')}
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={!configured || busy === 'sync'}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy === 'sync' ? '...' : t('integration.freshrssSyncNow')}
            </button>
          </div>

          {(data?.lastSyncAt || data?.lastSyncError) && (
            <div className="text-xs text-muted space-y-1">
              {data.lastSyncAt && (
                <p>{t('integration.freshrssLastSync', { time: new Date(data.lastSyncAt).toLocaleString() })}</p>
              )}
              {data.lastSyncError && (
                <p className="text-error">{t('integration.freshrssLastError', { error: data.lastSyncError })}</p>
              )}
            </div>
          )}

          {message && (
            <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
