/**
 * Simple build script for the Web Concierge widget
 * Creates a standalone embeddable version
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🔨 Building Web Concierge widget...')

// Read the source HTML
const sourceHtml = readFileSync(join(__dirname, 'index.html'), 'utf-8')

// Extract just the widget div and script with safe regex
// Using more specific patterns to avoid ReDoS
const widgetMatch = sourceHtml.match(/<div class="flypost-concierge-widget">[^]*?<\/div>/i)
const styleMatch = sourceHtml.match(/<style>[^]*?<\/style>/i)
const scriptMatch = sourceHtml.match(/<script>[^]*?<\/script>/i)

if (!widgetMatch || !styleMatch || !scriptMatch) {
  console.error('❌ Failed to extract widget components')
  process.exit(1)
}

// Create embeddable version
const embeddable = `<!-- Flypost Web Concierge Widget -->
<!-- Include this snippet in your HTML -->
${styleMatch[0]}

${widgetMatch[0]}

${scriptMatch[0]}
`

writeFileSync(join(__dirname, 'embeddable.html'), embeddable)

console.log('✅ Built embeddable.html')
console.log('📦 Widget is ready for embedding')
console.log('')
console.log('To use:')
console.log('1. Copy the contents of embeddable.html')
console.log('2. Paste into your Webflow custom code section')
console.log('3. Update the API_BASE_URL variable to your backend URL')
