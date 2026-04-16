import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    async signIn({ user }) {
      const email = (user.email ?? '').trim().toLowerCase()
      if (!email) return false

      const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)

      const allowedDomains = ['repairwise.pro', 'fixlane.com']

      return (
        allowedEmails.includes(email) ||
        allowedDomains.some(domain => email.endsWith(`@${domain}`))
      )
    },
  },
}
