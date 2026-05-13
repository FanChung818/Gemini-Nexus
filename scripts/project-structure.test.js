import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function exists(relativePath) {
    try {
        await stat(path.join(process.cwd(), relativePath));
        return true;
    } catch {
        return false;
    }
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.join(process.cwd(), relativePath), 'utf8'));
}

function countCodeLines(source) {
    return source.split('\n').filter((line) => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('//');
    }).length;
}

describe('project structure', () => {
    it('uses the repository root as the runnable extension project root', async () => {
        await expect(exists('.github/workflows/package-extension.yml')).resolves.toBe(true);
        await expect(exists('package.json')).resolves.toBe(true);
        await expect(exists('manifest.json')).resolves.toBe(true);
        await expect(exists('gemini-nexus/package.json')).resolves.toBe(false);
    });

    it('uses shared/ for cross-runtime utilities instead of lib/', async () => {
        await expect(exists('shared')).resolves.toBe(true);
        await expect(exists('lib')).resolves.toBe(false);
        await expect(exists('background/lib')).resolves.toBe(false);
    });

    it('groups shared runtime code by capability with thin compatibility wrappers', async () => {
        const capabilityModules = [
            'shared/config/constants.js',
            'shared/dom/crop_utils.js',
            'shared/media/watermark_remover.js',
            'shared/messaging/index.js',
            'shared/text/tool_call_text.js',
            'shared/utils/index.js',
        ];
        const compatibilityWrappers = [
            'shared/constants.js',
            'shared/crop_utils.js',
            'shared/messaging.js',
            'shared/tool_call_text.js',
            'shared/utils.js',
            'shared/watermark_remover.js',
        ];

        for (const modulePath of capabilityModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        for (const wrapperPath of compatibilityWrappers) {
            const source = await readFile(path.join(process.cwd(), wrapperPath), 'utf8');
            expect(source.trim()).toMatch(/^export \* from '\.\/.+\.js';$/);
            expect(source.trim().split('\n')).toHaveLength(1);
        }
    });

    it('keeps MCP manager helpers split from the connection state machine', async () => {
        const helperModules = [
            'background/managers/mcp/transport.js',
            'background/managers/mcp/tool_result.js',
            'background/managers/mcp/preamble.js',
            'background/managers/mcp/server_tools.js',
        ];

        for (const modulePath of helperModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        const manager = await readFile(
            path.join(process.cwd(), 'background/managers/mcp_remote_manager.js'),
            'utf8'
        );
        expect(manager).toContain("from './mcp/transport.js'");
        expect(manager).toContain("from './mcp/tool_result.js'");
        expect(manager).toContain("from './mcp/preamble.js'");
        expect(manager).toContain("from './mcp/server_tools.js'");
        expect(countCodeLines(manager)).toBeLessThan(650);
    });

    it('keeps connection settings helpers split from the settings section controller', async () => {
        const helperModules = [
            'sandbox/ui/settings/sections/connection_utils.js',
            'sandbox/ui/settings/sections/mcp_tools_view.js',
        ];

        for (const modulePath of helperModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        const section = await readFile(
            path.join(process.cwd(), 'sandbox/ui/settings/sections/connection.js'),
            'utf8'
        );
        expect(section).toContain("from './connection_utils.js'");
        expect(section).toContain("from './mcp_tools_view.js'");
        expect(countCodeLines(section)).toBeLessThan(600);
    });

    it('keeps message rendering helpers split from the message state controller', async () => {
        const helperModules = [
            'sandbox/render/copy_button.js',
            'sandbox/render/message_media.js',
            'sandbox/render/sources.js',
        ];

        for (const modulePath of helperModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        const message = await readFile(
            path.join(process.cwd(), 'sandbox/render/message.js'),
            'utf8'
        );
        expect(message).toContain("from './copy_button.js'");
        expect(message).toContain("from './message_media.js'");
        expect(message).toContain("from './sources.js'");
        expect(countCodeLines(message)).toBeLessThan(650);
    });

    it('keeps release version metadata synchronized', async () => {
        const packageJson = await readJson('package.json');
        const packageLock = await readJson('package-lock.json');
        const manifest = await readJson('manifest.json');
        const changelog = await readFile(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8');
        const firstHeading = changelog.split('\n').find((line) => line.startsWith('## '));

        expect(manifest.version).toBe(packageJson.version);
        expect(packageLock.version).toBe(packageJson.version);
        expect(packageLock.packages[''].version).toBe(packageJson.version);
        expect(firstHeading).toContain(`v${packageJson.version}`);
    });

    it('keeps type checking strict while allowing incremental JS migration', async () => {
        const tsconfig = await readJson('tsconfig.json');
        const compilerOptions = tsconfig.compilerOptions || {};

        expect(compilerOptions.strict).toBe(true);
        expect(compilerOptions.allowJs).toBe(true);
        expect(compilerOptions.checkJs).toBe(false);

        const checkedCoreFiles = [
            'scripts/package-extension.mjs',
            'background/managers/mcp/transport.js',
            'background/managers/mcp/tool_result.js',
            'background/managers/mcp/preamble.js',
            'background/managers/mcp/server_tools.js',
        ];

        for (const file of checkedCoreFiles) {
            const source = await readFile(path.join(process.cwd(), file), 'utf8');
            expect(source.startsWith('// @ts-check')).toBe(true);
        }
    });

    it('does not depend on remotely hosted runtime code or styles', async () => {
        const manifest = await readJson('manifest.json');
        const sandboxCsp = manifest.content_security_policy?.sandbox || '';
        const runtimeFiles = [
            'sandbox/boot/loader.js',
            'sandbox/index.html',
            'content/toolbar/view/dom.js',
        ];

        expect(sandboxCsp).not.toContain('cdn.jsdelivr.net');

        for (const file of runtimeFiles) {
            const source = await readFile(path.join(process.cwd(), file), 'utf8');
            expect(source).not.toMatch(/https:\/\/cdn\.jsdelivr\.net/);
        }
    });
});
