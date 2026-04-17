import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/owners', destination: '/accounts', permanent: false },
      { source: '/owners/:id', destination: '/accounts/:id', permanent: false },
    ]
  },
  // Prefer this repo as tracing root when a parent directory has another lockfile (e.g. pnpm).
  outputFileTracingRoot: path.join(__dirname),
  // Next.js NFT does not follow @duckdb/node-bindings' dynamic require() of the
  // platform package (e.g. linux-x64 on Vercel). Without this, prod lambdas 500
  // immediately while local dev (darwin) still works.
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/@duckdb/node-bindings-linux-x64/**/*',
      './node_modules/@duckdb/node-bindings-linux-arm64/**/*',
    ],
  },
  // Next 15: DuckDB native bindings must not be webpack-bundled.
  serverExternalPackages: ['@duckdb/node-api', '@duckdb/node-bindings'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const duckExternals = ['@duckdb/node-api', '@duckdb/node-bindings']
      const prev = config.externals
      if (prev == null) {
        config.externals = duckExternals
      } else if (Array.isArray(prev)) {
        config.externals = [...prev, ...duckExternals]
      } else {
        config.externals = [prev, ...duckExternals]
      }
    }
    return config
  },
}

export default nextConfig
