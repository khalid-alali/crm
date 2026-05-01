import type { EmailTemplateCategory } from '@/lib/email-template-categories'
import { EMAIL_TEMPLATE_CATEGORY_LABELS } from '@/lib/email-template-categories'

export function categoryPillClass(cat: string): string {
  const c = cat as EmailTemplateCategory
  const map: Record<string, string> = {
    vinfast: 'bg-violet-100 text-violet-800',
    tesla: 'bg-emerald-100 text-emerald-800',
    multidrive: 'bg-amber-100 text-amber-900',
    general: 'bg-arctic-200 text-onix-800',
    bdr_outreach: 'bg-sky-100 text-sky-900',
  }
  return map[c] ?? 'bg-arctic-100 text-onix-700'
}

export function categoryLabel(cat: string): string {
  if (cat in EMAIL_TEMPLATE_CATEGORY_LABELS) {
    return EMAIL_TEMPLATE_CATEGORY_LABELS[cat as EmailTemplateCategory]
  }
  return cat
}

export function previewPlainFromHtml(html: string, maxLen = 140): string {
  const t = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sec = Math.round((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 14) return `${day}d ago`
  return d.toLocaleDateString()
}
