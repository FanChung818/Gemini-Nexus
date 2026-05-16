import { describe, expect, it } from 'vitest';
import {
    createPackagedManifest,
    formatContentBundle,
    shouldExcludeFromPackage,
} from './package-extension.mjs';

describe('package-extension', () => {
    it('excludes test files from packaged source directories', () => {
        expect(shouldExcludeFromPackage('services/parser.test.js')).toBe(true);
        expect(
            shouldExcludeFromPackage('background/managers/session/context_manager.test.js')
        ).toBe(true);
        expect(shouldExcludeFromPackage('shared/text/tool_call_text.test.js')).toBe(true);
    });

    it('keeps runtime source files in the package', () => {
        expect(shouldExcludeFromPackage('services/parser.js')).toBe(false);
        expect(shouldExcludeFromPackage('background/index.js')).toBe(false);
        expect(shouldExcludeFromPackage('shared/text/tool_call_text.js')).toBe(false);
        expect(shouldExcludeFromPackage('dist/assets/app.js')).toBe(false);
    });

    it('rewrites packaged manifest to use the bundled content entry', () => {
        const manifest = {
            name: 'Gemini Nexus',
            content_scripts: [
                {
                    matches: ['<all_urls>'],
                    js: ['content/overlay.js', 'content/index.js'],
                    run_at: 'document_end',
                },
            ],
        };

        expect(createPackagedManifest(manifest).content_scripts).toEqual([
            {
                matches: ['<all_urls>'],
                js: ['content/index.js'],
                run_at: 'document_end',
            },
        ]);
    });

    it('formats content bundle segments in deterministic order', () => {
        const bundle = formatContentBundle([
            { relativePath: 'content/first.js', source: 'window.first = true;' },
            { relativePath: 'content/second.js', source: 'window.second = window.first;' },
        ]);

        expect(bundle).toContain('// ----- content/first.js -----');
        expect(bundle).toContain('// ----- content/second.js -----');
        expect(bundle.indexOf('window.first = true;')).toBeLessThan(
            bundle.indexOf('window.second = window.first;')
        );
        expect(bundle.endsWith('\n')).toBe(true);
    });
});
