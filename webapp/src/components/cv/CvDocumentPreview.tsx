// Renders the same cleaned CV structure used by PDF and Word exports.
import { cvMarkdownToBlocks } from '@/lib/cv-export-format'

type CvDocumentPreviewProps = {
  markdown: string
  className?: string
}

export default function CvDocumentPreview({ markdown, className = '' }: CvDocumentPreviewProps) {
  const blocks = cvMarkdownToBlocks(markdown)

  return (
    <div className={`overflow-y-auto rounded-lg border bg-white px-6 py-5 text-sm leading-relaxed text-slate-700 ${className}`}>
      {blocks.map((block, index) => {
        if (block.type === 'blank') return <div key={index} className="h-2" />
        if (block.type === 'heading' && block.level === 1) {
          return <h1 key={index} className="mb-3 border-b pb-2 text-2xl font-semibold text-slate-900">{block.text}</h1>
        }
        if (block.type === 'heading' && block.level === 2) {
          return <h2 key={index} className="mb-2 mt-4 border-t pt-3 text-sm font-bold uppercase tracking-wide text-slate-900">{block.text}</h2>
        }
        if (block.type === 'heading') {
          return <h3 key={index} className="mb-1 mt-3 font-semibold text-slate-900">{block.text}</h3>
        }
        if (block.type === 'bullet') {
          return (
            <div key={index} className="flex gap-2 pl-3">
              <span aria-hidden="true">•</span>
              <span>{block.text}</span>
            </div>
          )
        }
        return <p key={index} className="mb-1">{block.text}</p>
      })}
    </div>
  )
}
