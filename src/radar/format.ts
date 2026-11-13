// Copied from the radar repo (shared/format.ts): keep the two in step.
/**
 * "just now", "33m ago", "4h ago", "yesterday", "3d ago". Plain math instead of
 * Intl.RelativeTimeFormat, which Hermes (React Native on Android) doesn't have.
 */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`
  const days = Math.floor(seconds / 86_400)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

const TURKISH: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }

/** "Şemistan's Linux" → "semistan-s-linux" (matches the backend's [a-z0-9-] rule) */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[çğıöşü]/g, (c) => TURKISH[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/** "linux kernel, torvalds ,, " → ["linux kernel", "torvalds"] */
export function splitList(text: string): string[] {
  return [...new Set(text.split(',').map((w) => w.trim()).filter(Boolean))]
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Hide snippets that are just the title again ("Title Publisher"), common in older Google News items. */
export function isUsefulSnippet(snippet: string | null, title: string): snippet is string {
  if (!snippet) return false
  const s = normalize(snippet)
  const t = normalize(title)
  return !(t && (s.startsWith(t) || t.startsWith(s)))
}

/** "Name · @handle" → ["Name", "@handle"] */
export function splitAuthor(author: string | null): [string, string | null] {
  if (!author) return ['Unknown', null]
  const [name, handle] = author.split(' · ')
  return [name, handle ?? null]
}

/** 2520 → "42 min", 3900 → "1 h 5 min"; clock style for video badges: 754 → "12:34" */
export function formatDuration(seconds: number, clock = false): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (clock) {
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
    return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
  }
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`
  return `${Math.max(1, m)} min`
}

/** Pulls the video id out of watch, youtu.be and shorts URLs. */
export function youTubeId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)
  return match ? match[1] : null
}
