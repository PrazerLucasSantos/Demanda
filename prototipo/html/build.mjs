// Gera html/data/*.js a partir dos JSONs do épico. Uso: node html/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (n) => JSON.parse(fs.readFileSync(path.join(here, '..', n), 'utf8'));
const out = (n, v, g) =>
  fs.writeFileSync(path.join(here, 'data', n), `window.${g}=${JSON.stringify(v)};\n`);
out('forms.js', src('forms.json'), 'ATLAS_FORMS');
out('workspaces.js', src('workspaces.json'), 'ATLAS_WORKSPACES');
out('portals.js', src('portals.json'), 'ATLAS_PORTALS');
out('groups.js', src('class-groups.json'), 'ATLAS_GROUPS');
out('flows.js', src('flows.json'), 'ATLAS_FLOWS');
out('epic.js', src('epic.json'), 'ATLAS_EPIC');
console.log('ok');
