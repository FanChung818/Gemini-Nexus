import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function readManifestContentScriptOrder() {
    const manifest = JSON.parse(readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
    return manifest.content_scripts
        .filter((entry) => entry.world !== 'MAIN' && entry.all_frames !== true)
        .flatMap((entry) => entry.js ?? []);
}

export const CONTENT_SCRIPT_ORDER = readManifestContentScriptOrder();
