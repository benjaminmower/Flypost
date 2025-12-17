/*
 * Flypost v4 - Source Provenance Utilities
 * Manages source tracking for events ingested from multiple systems
 * (MLS, calendar, scraper, manual, LLM adapter, etc.)
 */

/**
 * Create a unique key for source deduplication.
 * Uses sourceType + sourceId if both present, otherwise just sourceType.
 * 
 * @param {object} source - Source object with sourceType and optional sourceId
 * @returns {string} - Unique key for deduplication
 */
function createSourceKey(source) {
  if (!source || !source.sourceType) {
    return null
  }
  
  if (source.sourceId) {
    return `${source.sourceType}:${source.sourceId}`
  }
  
  return source.sourceType
}

/**
 * Add or update source information in an event's sources array.
 * Deduplicates by sourceType + sourceId.
 * 
 * @param {object[]} existingSources - Existing sources array (may be undefined)
 * @param {object} newSource - New source to add: { sourceType, sourceId? }
 * @returns {object[]} - Updated sources array
 */
export function mergeSources(existingSources, newSource) {
  // Initialize sources array if needed
  const sources = Array.isArray(existingSources) ? [...existingSources] : []
  
  // Skip if no valid source provided
  if (!newSource || !newSource.sourceType) {
    return sources
  }
  
  // Create source key for deduplication
  const newSourceKey = createSourceKey(newSource)
  
  // Check if source already exists
  const existingIndex = sources.findIndex(s => {
    const existingKey = createSourceKey(s)
    return existingKey === newSourceKey
  })
  
  if (existingIndex >= 0) {
    // Update existing source with new timestamp
    const existing = sources[existingIndex]
    sources[existingIndex] = {
      ...newSource,
      addedAt: existing.addedAt, // Preserve original addedAt
      updatedAt: new Date().toISOString() // Track when it was last updated
    }
    console.log(`📍 Updated existing source: ${newSource.sourceType}${newSource.sourceId ? ` (${newSource.sourceId})` : ''}`)
  } else {
    // Add new source
    sources.push({
      ...newSource,
      addedAt: new Date().toISOString()
    })
    console.log(`📍 Added new source: ${newSource.sourceType}${newSource.sourceId ? ` (${newSource.sourceId})` : ''}`)
  }
  
  return sources
}

/**
 * Validate a source object structure.
 * @param {object} source - Source object to validate
 * @returns {object} - { valid: boolean, error?: string }
 */
export function validateSource(source) {
  if (!source) {
    return { valid: false, error: 'Source is required' }
  }
  
  if (typeof source !== 'object') {
    return { valid: false, error: 'Source must be an object' }
  }
  
  if (!source.sourceType || typeof source.sourceType !== 'string') {
    return { valid: false, error: 'Source must have a sourceType string' }
  }
  
  if (source.sourceId !== undefined && typeof source.sourceId !== 'string') {
    return { valid: false, error: 'sourceId must be a string if provided' }
  }
  
  return { valid: true }
}
