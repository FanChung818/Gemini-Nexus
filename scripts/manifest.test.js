import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function listJavaScriptFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
        entries.map(async (entry) => {
            const entryPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                return listJavaScriptFiles(entryPath);
            }

            if (entry.isFile() && entryPath.endsWith('.js') && !entryPath.endsWith('.test.js')) {
                return [entryPath.split(path.sep).join('/')];
            }

            return [];
        })
    );

    return files.flat().sort();
}

describe('manifest content scripts', () => {
    it('lists every runtime content script file exactly once', async () => {
        const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
        const listedFiles = manifest.content_scripts.flatMap((entry) => entry.js ?? []);
        const uniqueListedFiles = [...new Set(listedFiles)].sort();
        const runtimeContentFiles = await listJavaScriptFiles('content');

        expect(listedFiles).toHaveLength(uniqueListedFiles.length);
        expect(uniqueListedFiles).toEqual(runtimeContentFiles);
    });

    it('only exposes web accessible resources that exist in the source tree', async () => {
        const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
        const resources = manifest.web_accessible_resources.flatMap(
            (entry) => entry.resources ?? []
        );

        for (const resource of resources) {
            const pathToCheck = resource.endsWith('/*') ? resource.slice(0, -2) : resource;
            await expect(stat(pathToCheck), resource).resolves.toBeTruthy();
        }
    });
});
