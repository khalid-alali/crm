import type { Metadata } from 'next'
import heroImage from '../../Gemini_Generated_Image_sk07nesk07nesk07.png'
import { getWelcomeQuotes } from '@/lib/welcome-quotes'
import { SignInClient } from './sign-in-client'

export const metadata: Metadata = {
  title: 'Sign in · Fixlane CRM',
}

function pickRandomQuote(quotes: string[]): string {
  if (quotes.length === 0) return 'Fixlane CRM'
  return quotes[Math.floor(Math.random() * quotes.length)]
}

function safeCallbackUrl(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//')) return '/shops'
  return v
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const sp = await searchParams
  const quotes = getWelcomeQuotes()
  const quote = pickRandomQuote(quotes)
  const callbackUrl = safeCallbackUrl(sp.callbackUrl)
  return <SignInClient quote={quote} hero={heroImage} callbackUrl={callbackUrl} />
}
