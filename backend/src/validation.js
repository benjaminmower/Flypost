/*
 * Flypost v4 - Event Validation Service
 * Uses AJV to validate events against the v4 minimal schema
 */

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load schema
const schemaPath = join(__dirname, '../schemas/flypost-event-v4.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))

// Create AJV instance
// Note: Flexibility for additional properties is controlled by the schema file, not by the AJV instance configuration.
const ajv = new Ajv({ 
  allErrors: true
})
addFormats(ajv)

// Compile validator
const validateEvent = ajv.compile(schema)

/**
 * Validate an event object against the v4 schema
 * @param {object} eventData - The event object to validate
 * @returns {object} - Validation result with success flag and errors
 */
export function validateEventData(eventData) {
  const isValid = validateEvent(eventData)
  
  if (isValid) {
    return { 
      success: true, 
      data: eventData 
    }
  }
  
  // Format validation errors for better readability
  const formattedErrors = validateEvent.errors.map(error => ({
    field: error.instancePath || error.params?.missingProperty || 'root',
    message: error.message,
    value: error.data,
    allowedValues: error.params?.allowedValues || null
  }))
  
  return {
    success: false,
    errors: formattedErrors,
    message: `Schema validation failed: ${formattedErrors.length} error(s)`
  }
}

/**
 * Get the schema for documentation/reference
 * @returns {object} - The v4 event schema
 */
export function getSchema() {
  return schema
}

export default validateEvent