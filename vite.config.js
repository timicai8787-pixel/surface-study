import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

let commit = 'local'
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
} catch {
  // Not a repository yet; a local build is still a real build.
}

export default defineConfig({
  base: './',
  define: {
    __COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) || commit),
    __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME || new Date().toISOString()),
  },
  server: { host: '127.0.0.1' },
})
