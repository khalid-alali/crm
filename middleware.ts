import withAuth from 'next-auth/middleware'

export default withAuth({
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
  matcher: ['/((?!portal|api/webhooks|_next|favicon).*)'],
}
