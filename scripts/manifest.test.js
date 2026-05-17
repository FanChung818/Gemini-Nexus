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

const classicContentSupportFiles = ['shared/dom/crop_core.js', 'shared/ui/copy_feedback.js'];

describe('manifest content scripts', () => {
    it('declares the native tab group permission used by browser control', async () => {
        const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));

        expect(manifest.permissions).toContain('tabGroups');
    });

    it('does not request the downloads permission when downloads use DOM anchors', async () => {
        const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));

        expect(manifest.permissions).not.toContain('downloads');
    });

    it('does not repeat host permissions already covered by all urls', async () => {
        const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));

        expect(manifest.host_permissions).toContain('<all_urls>');
        expect(manifest.host_permissions).not.toContain('https://gemini.google.com/*');
    });

    it('lists every runtime content script file exactly once', async () => {
        const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
        const listedFiles = manifest.content_scripts.flatMap((entry) => entry.js ?? []);
        const uniqueListedFiles = [...new Set(listedFiles)].sort();
        const runtimeContentFiles = [
            ...(await listJavaScriptFiles('content')),
            ...classicContentSupportFiles,
        ].sort();

        expect(listedFiles).toHaveLength(uniqueListedFiles.length);
        expect(uniqueListedFiles).toEqual(runtimeContentFiles);
    });

    it('loads content model metadata before scripts that render or submit model choices', async () => {
        const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
        const listedFiles = manifest.content_scripts.flatMap((entry) => entry.js ?? []);
        const modelOptionsIndex = listedFiles.indexOf('content/toolbar/model_options.js');

        expect(modelOptionsIndex).toBeGreaterThan(-1);
        for (const dependentFile of [
            'content/toolbar/templates.js',
            'content/toolbar/ui/manager.js',
            'content/toolbar/actions.js',
        ]) {
            expect(modelOptionsIndex).toBeLessThan(listedFiles.indexOf(dependentFile));
        }
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
