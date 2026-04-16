'use client'

import { signIn } from 'next-auth/react'
import Image, { type StaticImageData } from 'next/image'

export function SignInClient({
  quote,
  hero,
  callbackUrl,
}: {
  quote: string
  hero: StaticImageData
  callbackUrl: string
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-onix-950">
      <Image
        src={hero}
        alt=""
        fill
        priority
        className="object-cover object-center opacity-90"
        sizes="100vw"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-onix-950 via-onix-950/50 to-onix-950/30"
        aria-hidden
      />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-arctic-200/15 bg-onix-950/55 p-8 shadow-2xl backdrop-blur-md">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-arctic-300">
            Fixlane CRM
          </p>
          <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight text-arctic-50">
            Sign in
          </h1>
          <blockquote className="animate-crm-quote-fade-away mt-6 min-h-[4.5rem] text-center text-base leading-relaxed text-arctic-100">
            {quote}
          </blockquote>
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl })}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-arctic-50 px-4 py-3 text-sm font-medium text-onix-950 shadow-md transition hover:bg-arctic-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  )
}
