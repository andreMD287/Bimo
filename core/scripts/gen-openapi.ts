import { writeFileSync } from 'node:fs';
import { buildOpenApi, toYaml } from '../src/api/openapi';

const out = new URL('../openapi.yaml', import.meta.url);
writeFileSync(out, `# Generado por scripts/gen-openapi.ts desde src/api/contract.ts. No editar a mano.\n${toYaml(buildOpenApi())}`);
console.log('openapi.yaml generado');
