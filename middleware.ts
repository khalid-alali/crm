import withAuth from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    authorized({ token }) {
      if (
        process.env.NODE_ENV === 'development' &&
        process.env.AUTH_BYPASS === 'true'
      ) {
        return true
      }
      return !!token
    },
  },
})

export const config = {
  // Public shop portal + token APIs (auth enforced inside routes where needed).
  matcher: [
    '/((?!portal|api/portal|approve|request-changes|r/|api/labor-rate-approvals|api/webhooks|api/shops|api/cron|api/auth|api/twilio|api/stripe/webhook|api/expert-assist/intake|api/expert-assist/signup|api/expert-assist/activation|_next|favicon|signin).*)',
  ],
}
