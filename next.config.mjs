import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prefer this repo as tracing root when a parent directory has another lockfile (e.g. pnpm).
  outputFileTracingRoot: path.join(__dirname),
  // Next 15: native `duckdb` must not be webpack-bundled (avoids node-pre-gyp / node-gyp file graph).
  serverExternalPackages: ['duckdb'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const prev = config.externals
      if (prev == null) {
        config.externals = ['duckdb']
      } else if (Array.isArray(prev)) {
        config.externals = [...prev, 'duckdb']
      } else {
        config.externals = [prev, 'duckdb']
      }
    }
    return config
  },
}

export default nextConfig
