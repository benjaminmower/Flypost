/*
 * Flypost v4 - URL Extraction Utility
 * Deterministically extract external listing URLs from raw text input
 */

/**
 * Extract the first https:// URL from text input (deterministic, no LLM)
 * 
 * @param {string} text - Raw text input
 * @returns {string|undefined} - First valid https:// URL or undefined
 */
export function extractFirstUrl(text) {
  if (!text || typeof text !== 'string') {
    return undefined
  }

  // Regex to match https:// URLs
  // Matches: https:// followed by non-whitespace characters
  const urlRegex = /https:\/\/[^\s]+/g
  const matches = text.match(urlRegex)

  if (!matches || matches.length === 0) {
    return undefined
  }

  // Get first match
  let url = matches[0]

  // Trim whitespace
  url = url.trim()

  // Cap at 1000 characters
  if (url.length > 1000) {
    url = url.substring(0, 1000)
  }

  // Validate: must still start with https:// after trimming
  if (!url.startsWith('https://')) {
    return undefined
  }

  // Must have something after https://
  if (url.length <= 8) {
    return undefined
  }

  return url
}
