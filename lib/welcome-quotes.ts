import fs from 'fs'
import path from 'path'

function unwrapLine(line: string): string {
  const s = line.trim()
  if (s.length < 2) return s
  const open = s[0]
  const close = s[s.length - 1]
  const isWrapped =
    (open === '"' && close === '"') ||
    (open === '\u201c' && close === '\u201d')
  if (isWrapped) return s.slice(1, -1)
  return s
}

/** Lines from `welcome-quotes.txt` at repo root (server-only). */
export function getWelcomeQuotes(): string[] {
  const filePath = path.join(process.cwd(), 'welcome-quotes.txt')
  const raw = fs.readFileSync(filePath, 'utf-8')
  return raw
    .split(/\r?\n/)
    .map(unwrapLine)
    .filter(Boolean)
}
