import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { articleUrlToPath, extractDomain } from '../../lib/url'

interface ChatLinkedArticleProps {
  title: string
  url: string
  ogImage: string | null
}

export function ChatLinkedArticle({ title, url, ogImage }: ChatLinkedArticleProps) {
  const domain = extractDomain(url)

  return (
    <div className="max-w-2xl mx-auto w-full px-4 pt-4">
      <Link
        to={articleUrlToPath(url)}
        className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-bg-card hover:bg-hover transition-colors no-underline text-inherit select-none"
      >
        {ogImage ? (
          <img src={ogImage} alt="" className="w-12 h-12 object-cover rounded shrink-0" />
        ) : domain ? (
          <div className="w-12 h-12 rounded shrink-0 border border-border bg-bg-subtle flex items-center justify-center">
            <img src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`} alt="" width={20} height={20} />
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text truncate block">{title}</span>
          <span className="text-xs text-muted truncate block">{domain}</span>
        </div>
        <ExternalLink className="w-4 h-4 text-muted shrink-0" />
      </Link>
    </div>
  )
}
