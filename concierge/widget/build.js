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

// Extract components by finding matching pairs of opening/closing tags
// This handles nested tags correctly by counting depth
function extractTag(html, tagName, className = null) {
  const openTagPattern = className 
    ? new RegExp(`<${tagName}[^>]*class="${className}"[^>]*>`, 'i')
    : new RegExp(`<${tagName}[^>]*>`, 'i')
  
  const openMatch = html.match(openTagPattern)
  if (!openMatch) return null
  
  const startIndex = openMatch.index
  const afterOpenTag = startIndex + openMatch[0].length
  
  // Count nested tags to find the matching closing tag
  let depth = 1
  let currentIndex = afterOpenTag
  const closeTag = `</${tagName}>`
  const openTag = `<${tagName}`
  
  while (depth > 0 && currentIndex < html.length) {
    const nextOpen = html.indexOf(openTag, currentIndex)
    const nextClose = html.indexOf(closeTag, currentIndex)
    
    if (nextClose === -1) break
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      currentIndex = nextOpen + openTag.length
    } else {
      depth--
      if (depth === 0) {
        return html.substring(startIndex, nextClose + closeTag.length)
      }
      currentIndex = nextClose + closeTag.length
    }
  }
  
  return null
}

const widgetMatch = extractTag(sourceHtml, 'div', 'flypost-concierge-widget')
const styleMatch = extractTag(sourceHtml, 'style')
const scriptMatch = extractTag(sourceHtml, 'script')

if (!widgetMatch || !styleMatch || !scriptMatch) {
  console.error('❌ Failed to extract widget components')
  process.exit(1)
}

// Create embeddable version
const embeddable = `<!-- Flypost Web Concierge Widget -->
<!-- Include this snippet in your HTML -->
${styleMatch}

${widgetMatch}

${scriptMatch}
`

writeFileSync(join(__dirname, 'embeddable.html'), embeddable)

console.log('✅ Built embeddable.html')
console.log('📦 Widget is ready for embedding')
console.log('')
console.log('To use:')
console.log('1. Copy the contents of embeddable.html')
console.log('2. Paste into your Webflow custom code section')
console.log('3. Update the API_BASE_URL variable to your backend URL')
