#!/usr/bin/env node

/**
 * Generate openapi.json from openapi.yaml
 * 
 * This script converts the YAML OpenAPI specification to JSON format,
 * providing a machine-canonical representation for automated tooling.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicDir = join(__dirname, '..', 'public');
const yamlPath = join(publicDir, 'openapi.yaml');
const jsonPath = join(publicDir, 'openapi.json');

try {
  console.log('Reading OpenAPI YAML from:', yamlPath);
  const yamlContent = readFileSync(yamlPath, 'utf8');
  
  console.log('Parsing YAML...');
  const openapiDoc = yaml.load(yamlContent);
  
  console.log('Writing OpenAPI JSON to:', jsonPath);
  writeFileSync(jsonPath, JSON.stringify(openapiDoc, null, 2) + '\n', 'utf8');
  
  console.log('✅ Successfully generated openapi.json');
} catch (error) {
  console.error('❌ Error generating openapi.json:', error.message);
  process.exit(1);
}
