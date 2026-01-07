#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const distDir = join(projectRoot, 'dist')
const publicSource = join(projectRoot, 'public')

console.log('📦 Copying Ask-specific capability assets to dist...')

// Verify public directory exists
if (!existsSync(publicSource)) {
  console.error('❌ Error: frontend_ask/public directory not found')
  console.error('ℹ️  Ask surface requires manifests in public/.well-known/')
  process.exit(1)
}

// Copy .well-known directory from frontend_ask/public
const wellKnownSrc = join(publicSource, '.well-known')
const wellKnownDest = join(distDir, '.well-known')
if (existsSync(wellKnownSrc)) {
  mkdirSync(wellKnownDest, { recursive: true })
  cpSync(wellKnownSrc, wellKnownDest, { recursive: true })
  console.log('✅ Copied .well-known/ (Ask surface manifests)')
} else {
  console.error('❌ Error: .well-known directory not found in frontend_ask/public')
  console.error('ℹ️  Ask surface requires ai.json, llm.txt, and MCP manifests')
  process.exit(1)
}

// Copy openapi.yaml if it exists (Ask-specific or cached)
const openapiSrc = join(publicSource, 'openapi.yaml')
if (existsSync(openapiSrc)) {
  cpSync(openapiSrc, join(distDir, 'openapi.yaml'))
  console.log('✅ Copied openapi.yaml')
}

console.log('✅ All Ask capability assets copied successfully!')
console.log('ℹ️  Note: Ask surface serves read-only discovery manifests only')
