import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const webappRoot = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep file tracing inside this app when the repository has multiple lockfiles.
  outputFileTracingRoot: webappRoot,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // Keep these packages as Node.js externals - do not bundle them with webpack.
  // @prisma/client must stay external or webpack resolves its internal require()
  // calls against the generated .prisma/client/ folder instead of node_modules,
  // causing "Cannot find module .prisma/client/runtime/library.js" at startup.
  // pdf-parse and mammoth use native bindings that also cannot be bundled.
  serverExternalPackages: ['@prisma/client', 'prisma', 'pdf-parse', 'mammoth'],
}

export default nextConfig
