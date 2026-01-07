#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const distDir = join(projectRoot, 'dist')
const publicSource = join(projectRoot, 'public')

console.log('📦 Copying Post-specific capability assets to dist...')

// Create public directory if it doesn't exist yet
if (!existsSync(publicSource)) {
  console.warn('⚠️  Warning: frontend_post/public directory not found')
  console.log('ℹ️  Note: Post surface should have its own manifests in public/.well-known/')
  process.exit(0)
}

// Copy .well-known directory from frontend_post/public
const wellKnownSrc = join(publicSource, '.well-known')
const wellKnownDest = join(distDir, '.well-known')
if (existsSync(wellKnownSrc)) {
  mkdirSync(wellKnownDest, { recursive: true })
  cpSync(wellKnownSrc, wellKnownDest, { recursive: true })
  console.log('✅ Copied .well-known/ (Post surface manifests)')
} else {
  console.warn('⚠️  Warning: .well-known directory not found in frontend_post/public')
}

console.log('✅ All Post capability assets copied successfully!')
console.log('ℹ️  Note: Post surface serves write/publish manifests only')
