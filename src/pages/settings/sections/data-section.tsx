import { useState, useRef } from 'react'
import { useSWRConfig } from 'swr'
import { useI18n } from '../../../lib/i18n'
import { importOpml, fetchOpmlBlob } from '../../../lib/fetcher'
import { Upload, Download } from 'lucide-react'

export function DataSection() {
  const { t } = useI18n()
  const { mutate: globalMutate } = useSWRConfig()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setResult(null)
    setError(null)

    try {
      const data = await importOpml(file)
      setResult({ imported: data.imported, skipped: data.skipped })
      void globalMutate((key: unknown) =>
        typeof key === 'string' && (key.includes('/api/feeds') || key.includes('/api/articles') || key.includes('/api/categories')),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleExport() {
    const blob = await fetchOpmlBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'oksskolten.opml'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-4">{t('settings.importExport')}</h2>

      <div>
        <p className="text-sm text-text mb-1">{t('settings.importOpml')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.importOpmlDesc')}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".opml,.xml"
          onChange={handleImport}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border text-text hover:bg-hover transition-colors disabled:opacity-50"
        >
          <Upload size={14} />
          {importing ? t('settings.importing') : t('settings.importOpml')}
        </button>
        {result && (
          <p className="text-xs text-accent mt-2">
            Imported {result.imported} feeds ({result.skipped} skipped)
          </p>
        )}
        {error && (
          <p className="text-xs text-error mt-2">{error}</p>
        )}
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.exportOpml')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.exportOpmlDesc')}</p>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border text-text hover:bg-hover transition-colors"
        >
          <Download size={14} />
          {t('settings.exportOpml')}
        </button>
      </div>
    </section>
  )
}
