/**
 * Generates a deterministic canonical key for an event.
 * Format: <normalized-address>|<brokerageId>
 * 
 * @param {object} event - The Schema.org Event object
 * @param {string} brokerageId - The organization/brokerage identifier
 * @returns {string|null} The canonical key or null if address is missing
 */
export function computeCanonicalKey(event, brokerageId) {
  // Guard against missing location data
  if (!event.location || !event.location.address) return null
  
  const addr = event.location.address
  
  // Extract parts safely
  const parts = [
    addr.streetAddress,
    addr.addressLocality, // City
    addr.addressRegion,   // State
    addr.postalCode       // Zip
  ]

  // Normalize: lowercase, remove special chars, trim
  // Example: "123 Main St, City" -> "123mainst-city"
  const normalizedAddress = parts
    .map(p => (p || '').toString().toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean) // remove empty parts
    .join('-')

  if (!normalizedAddress) return null

  // Append brokerageId to namespace the uniqueness
  return `${normalizedAddress}|${brokerageId}`
}
