#!/usr/bin/env node
import { cpSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const distDir = join(projectRoot, 'dist')
const publicSource = join(projectRoot, '..', 'frontend', 'public')

console.log('📦 Copying capability assets from frontend/public to dist...')

// Copy .well-known directory
const wellKnownSrc = join(publicSource, '.well-known')
const wellKnownDest = join(distDir, '.well-known')
mkdirSync(wellKnownDest, { recursive: true })
cpSync(wellKnownSrc, wellKnownDest, { recursive: true })
console.log('✅ Copied .well-known/')

// Copy root-level files
const rootFiles = ['llm.txt', 'openapi.json', 'mcp.flypost.get.v1.json', 'mcp.flypost.parse.v1.json']
rootFiles.forEach(file => {
  const src = join(publicSource, file)
  const dest = join(distDir, file)
  cpSync(src, dest)
  console.log(`✅ Copied ${file}`)
})

console.log('✅ All capability assets copied successfully!')
