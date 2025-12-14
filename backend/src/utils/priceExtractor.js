/*
 * Flypost v4 - Deterministic Price Extractor
 * Server-side utility to extract price information from natural language text
 * Supports various formats: $1,250,000 | $1250000 | $2.5M | $2.5 million
 */

/**
 * Extract price information from natural language text
 * @param {string} text - Input text to parse for price
 * @returns {object|null} - Extracted price object or null if no price found
 * 
 * Returns object shape:
 * {
 *   listPrice: number,           // Numeric value (e.g., 1250000)
 *   listPriceDisplay: string,    // Display string from text (e.g., "$1,250,000")
 *   listPriceCurrency: string,   // Currency code (default "USD")
 *   priceType: string           // Type (default "LIST_PRICE")
 * }
 */
export function extractPriceFromText(text) {
  if (!text || typeof text !== 'string') {
    return null
  }

  // Pattern 1: Million notation - $X.X million/mil/M
  // Examples: $2.5 million, $2.5M, $2.5 mil, $11.975 million
  // Note: M can be directly after number, but "million" and "mil" need space
  const millionMatch = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(?:M\b|(?:\s+(?:million|mil)\b))/i)
  if (millionMatch) {
    const priceStr = millionMatch[1].replace(/,/g, '')
    const value = parseFloat(priceStr) * 1000000
    
    if (!isNaN(value) && value > 0) {
      return {
        listPrice: value,
        listPriceDisplay: millionMatch[0].trim(),
        listPriceCurrency: 'USD',
        priceType: 'LIST_PRICE'
      }
    }
  }

  // Pattern 2: Standard dollar notation - $XXX,XXX or $XXXXXX
  // Examples: $1,250,000 or $1250000
  // Use negative lookahead to exclude million notation
  const standardMatch = text.match(/\$\s?([\d,]+)(?!\s*(?:million|mil|M)\b)/i)
  if (standardMatch) {
    const priceStr = standardMatch[1].replace(/,/g, '')
    const value = parseFloat(priceStr)
    
    // Only accept if it's a reasonable price (> 0)
    if (!isNaN(value) && value > 0) {
      return {
        listPrice: value,
        listPriceDisplay: standardMatch[0].trim(),
        listPriceCurrency: 'USD',
        priceType: 'LIST_PRICE'
      }
    }
  }

  return null
}

/**
 * Check if an event has a valid list price
 * @param {object} event - Event object to check
 * @returns {boolean} - True if event has valid flypost.listPrice > 0
 */
export function hasValidListPrice(event) {
  return !!(
    event?.flypost?.listPrice &&
    typeof event.flypost.listPrice === 'number' &&
    event.flypost.listPrice > 0
  )
}
