import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApiSpec } from '../docs/openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, '../../docs');

async function exportDocs() {
  const jsonContent = JSON.stringify(openApiSpec, null, 2);
  
  const openApiPath = path.join(docsDir, 'openapi.json');
  const contractPath = path.join(docsDir, 'api-contract.json');

  await fs.writeFile(openApiPath, jsonContent + '\n', 'utf-8');
  await fs.writeFile(contractPath, jsonContent + '\n', 'utf-8');

  console.log(`✅ OpenAPI contract exported successfully:`);
  console.log(`   - ${openApiPath}`);
  console.log(`   - ${contractPath}`);
}

exportDocs().catch((err) => {
  console.error('❌ Failed to export docs:', err);
  process.exit(1);
});

