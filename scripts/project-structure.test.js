import { readdir, readFile, stat } from 'node:fs/promises';
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

async function collectSiblingModuleDirectoryConflicts(relativePath = '.') {
    const absolutePath = path.join(process.cwd(), relativePath);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    const directoryNames = new Set(
        entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    );
    const conflicts = [];

    for (const entry of entries) {
        if (
            entry.isDirectory() &&
            !['.git', 'node_modules', 'dist', 'artifacts'].includes(entry.name)
        ) {
            conflicts.push(
                ...(await collectSiblingModuleDirectoryConflicts(
                    path.join(relativePath, entry.name)
                ))
            );
        }

        if (entry.isFile() && entry.name.endsWith('.js')) {
            const moduleName = entry.name.slice(0, -'.js'.length);
            if (directoryNames.has(moduleName)) {
                conflicts.push(path.join(relativePath, entry.name));
            }
        }
    }

    return conflicts;
}

async function collectSharedRootModules() {
    const entries = await readdir(path.join(process.cwd(), 'shared'), { withFileTypes: true });

    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => path.join('shared', entry.name))
        .sort();
}

async function collectUnexpectedSourceFilenames(relativePath = '.') {
    const absolutePath = path.join(process.cwd(), relativePath);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    const violations = [];
    const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'artifacts']);
    const rootConfigFiles = new Set(['vite.config.ts']);

    for (const entry of entries) {
        const entryPath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
            if (!ignoredDirectories.has(entry.name)) {
                violations.push(...(await collectUnexpectedSourceFilenames(entryPath)));
            }
            continue;
        }

        if (!entry.isFile() || !entry.name.match(/\.(js|mjs|ts)$/)) continue;

        const normalizedPath = entryPath.split(path.sep).join('/');
        const basename = path.basename(entry.name).replace(/\.(js|mjs|ts)$/, '');
        const moduleName = basename.replace(/\.test$/, '');

        if (rootConfigFiles.has(normalizedPath)) continue;
        if (moduleName === 'index') continue;
        if (/^[a-z0-9_]+$/.test(moduleName)) continue;
        if (normalizedPath.startsWith('scripts/') && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(moduleName)) {
            continue;
        }

        violations.push(normalizedPath);
    }

    return violations.sort();
}

function countCodeLines(source) {
    return source.split('\n').filter((line) => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('//');
    }).length;
}

function collectI18nKeysFromSource(source) {
    const keys = new Set();
    const patterns = [
        /data-i18n(?:-title|-placeholder)?="([^"]+)"/g,
        /t\(\s*['"]([^'"]+)['"]\s*\)/g,
        /formatT\(\s*['"]([^'"]+)['"]\s*,/g,
    ];

    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            keys.add(match[1]);
        }
    }

    return keys;
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

    it('groups shared runtime code by capability without root-level compatibility wrappers', async () => {
        const capabilityModules = [
            'shared/attachments/index.js',
            'shared/config/constants.js',
            'shared/dom/crop_utils.js',
            'shared/mcp/transport.js',
            'shared/media/watermark_remover.js',
            'shared/messaging/index.js',
            'shared/models/web_models.js',
            'shared/settings/connection.js',
            'shared/text/tool_call_text.js',
            'shared/utils/index.js',
        ];
        const removedCompatibilityWrappers = [
            'shared/attachments.js',
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

        for (const wrapperPath of removedCompatibilityWrappers) {
            await expect(exists(wrapperPath)).resolves.toBe(false);
        }

        await expect(collectSharedRootModules()).resolves.toEqual([]);
    });

    it('avoids sibling module files that share a name with implementation directories', async () => {
        await expect(collectSiblingModuleDirectoryConflicts()).resolves.toEqual([]);
    });

    it('keeps source filenames aligned with runtime and script naming conventions', async () => {
        await expect(collectUnexpectedSourceFilenames()).resolves.toEqual([]);
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
        expect(manager).not.toContain('DEBUG_MCP_REMOTE');
        expect(manager).not.toContain('debugMcpRemote');
        expect(countCodeLines(manager)).toBeLessThan(650);
    });

    it('does not export helpers that are only used inside their own module', async () => {
        const webModels = await readFile(
            path.join(process.cwd(), 'shared/models/web_models.js'),
            'utf8'
        );
        const sessionUtils = await readFile(
            path.join(process.cwd(), 'background/handlers/session/utils.js'),
            'utf8'
        );
        const packageExtension = await readFile(
            path.join(process.cwd(), 'scripts/package-extension.mjs'),
            'utf8'
        );

        expect(webModels).not.toMatch(/export function normalizeWebModel\s*\(/);
        expect(sessionUtils).not.toMatch(/export function createOfficialFunctionResponsePart\s*\(/);
        expect(packageExtension).not.toMatch(/export function getLocalDependencyAssets\s*\(/);
    });

    it('keeps i18n dictionaries free of untranslated orphan keys', async () => {
        const runtimeFiles = [
            'sandbox/controllers/session_flow.js',
            'sandbox/controllers/app_controller.js',
            'sandbox/controllers/prompt.js',
            'sandbox/controllers/message_handler.js',
            'sandbox/render/content.js',
            'sandbox/render/sources.js',
            'sandbox/render/config.js',
            'sandbox/render/copy_button.js',
            'sandbox/render/message.js',
            'sandbox/render/generated_image.js',
            'sandbox/boot/app.js',
            'sandbox/boot/renderer.js',
            'sandbox/boot/events.js',
            'sandbox/ui/chat.js',
            'sandbox/ui/model_options.js',
            'sandbox/ui/sidebar.js',
            'sandbox/ui/tab_selector.js',
            'sandbox/ui/settings/index.js',
            'sandbox/ui/settings/sections/connection.js',
            'sandbox/ui/settings/sections/mcp_tools_view.js',
            'sandbox/ui/templates/footer.js',
            'sandbox/ui/templates/header.js',
            'sandbox/ui/templates/sidebar.js',
            'sandbox/ui/templates/tab_selector.js',
            'sandbox/ui/templates/viewer.js',
            'sandbox/ui/templates/settings/about.js',
            'sandbox/ui/templates/settings/appearance.js',
            'sandbox/ui/templates/settings/connection.js',
            'sandbox/ui/templates/settings/general.js',
            'sandbox/ui/templates/settings/index.js',
            'sandbox/ui/templates/settings/shortcuts.js',
        ];
        const i18n = await readFile(path.join(process.cwd(), 'sandbox/core/i18n.js'), 'utf8');
        const usedKeys = new Set();

        for (const runtimeFile of runtimeFiles) {
            const source = await readFile(path.join(process.cwd(), runtimeFile), 'utf8');
            for (const key of collectI18nKeysFromSource(source)) {
                usedKeys.add(key);
            }
        }

        for (const match of i18n.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9_]*):/gm)) {
            expect(usedKeys.has(match[1]), match[1]).toBe(true);
        }
    });

    it('does not keep orphaned legacy message actions without senders', async () => {
        const sourcePaths = [
            'background/messages.js',
            'background/handlers/ui.js',
            'content/messages.js',
            'sandbox/boot/messaging.js',
            'sandbox/controllers/message_handler.js',
        ];
        const retiredActions = [
            'CAPTURE_SCREENSHOT',
            'FOCUS_INPUT',
            'DOM_NOT_FOUND',
            'RESTORE_BROWSER_LOOP_LIMIT',
            'SET_SIDEBAR_CAPTURE_MODE',
            'TOGGLE_PAGE_CONTEXT',
            'LOG_ENTRY',
        ];

        for (const sourcePath of sourcePaths) {
            const source = await readFile(path.join(process.cwd(), sourcePath), 'utf8');
            for (const action of retiredActions) {
                expect(source).not.toContain(action);
            }
        }
    });

    it('does not keep controller methods that only supported retired message actions', async () => {
        const appController = await readFile(
            path.join(process.cwd(), 'sandbox/controllers/app_controller.js'),
            'utf8'
        );

        expect(appController).not.toMatch(/\bsetPageContext\s*\(/);
    });

    it('keeps content toolbar bindings scoped to controls rendered by the content toolbar', async () => {
        const events = await readFile(
            path.join(process.cwd(), 'content/toolbar/events.js'),
            'utf8'
        );

        expect(events).not.toContain('browser-control-btn');
    });

    it('does not keep browser-control action wrapper methods without distinct behavior', async () => {
        const baseActionHandler = await readFile(
            path.join(process.cwd(), 'background/control/actions/base.js'),
            'utf8'
        );

        expect(baseActionHandler).not.toMatch(/\bhighlightObjectId\s*\(/);
    });

    it('does not expose content toolbar template helpers that only back the rendered template getter', async () => {
        const templates = await readFile(
            path.join(process.cwd(), 'content/toolbar/templates.js'),
            'utf8'
        );

        expect(templates).not.toMatch(
            /window\.GeminiToolbarTemplates\s*=\s*\{[\s\S]*\bbuildMainStructure\s*,/
        );
    });

    it('does not keep content toolbar pin/dock state facades after removing the pin UI entry point', async () => {
        const files = [
            'content/toolbar/controller.js',
            'content/toolbar/view/index.js',
            'content/toolbar/view/window.js',
            'content/toolbar/view/utils.js',
        ];

        for (const file of files) {
            const source = await readFile(path.join(process.cwd(), file), 'utf8');
            expect(source).not.toMatch(/\b(isPinned|togglePin|isDocked)\b/);
        }
    });

    it('does not keep obsolete content toolbar HTML-mode render parameters', async () => {
        const view = await readFile(
            path.join(process.cwd(), 'content/toolbar/view/index.js'),
            'utf8'
        );

        expect(view).not.toContain('isHtml');
    });

    it('does not keep unread content toolbar controller fields for self-bound DOM listeners', async () => {
        const uiManager = await readFile(
            path.join(process.cwd(), 'content/toolbar/ui/manager.js'),
            'utf8'
        );
        const controller = await readFile(
            path.join(process.cwd(), 'content/toolbar/controller.js'),
            'utf8'
        );

        expect(uiManager).not.toContain('toolbarDragController');
        expect(controller).not.toMatch(/\bthis\.(streamHandler|selectionObserver)\s*=/);
    });

    it('does not keep CSS selectors with no runtime or template producer', async () => {
        const toolbarCoreStyles = await readFile(
            path.join(process.cwd(), 'content/toolbar/styles/core.js'),
            'utf8'
        );
        const componentStyles = await readFile(
            path.join(process.cwd(), 'css/components.css'),
            'utf8'
        );

        expect(toolbarCoreStyles).not.toContain('loading-state');
        expect(toolbarCoreStyles).not.toMatch(/\.spinner\b/);
        expect(componentStyles).not.toContain('setting-panel-note');
    });

    it('documents current shared and directory entrypoint conventions', async () => {
        const readme = await readFile(path.join(process.cwd(), 'README.md'), 'utf8');

        expect(readme).toContain('不再保留顶层 `shared/*.js` 兼容入口');
        expect(readme).toContain('模块目录的聚合入口统一使用目录内 `index.js`');
        expect(readme).toContain('运行域入口保留为各运行域根部的 `index.js`');
        expect(readme).toContain('运行时代码文件使用 `snake_case`');
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

    it('keeps extension pages free of inline scripts blocked by extension CSP', async () => {
        const manifest = await readJson('manifest.json');
        const extensionCsp = manifest.content_security_policy?.extension_pages || '';
        const extensionPages = ['sidepanel/index.html'];

        expect(extensionCsp).toContain("script-src 'self'");

        for (const file of extensionPages) {
            const source = await readFile(path.join(process.cwd(), file), 'utf8');
            expect(source).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
        }
    });

    it('keeps vendor assets limited to extension runtime resources', async () => {
        await expect(exists('vendor/katex/katex.min.css')).resolves.toBe(true);
        await expect(exists('vendor/highlight.js/atom-one-dark.min.css')).resolves.toBe(true);
        await expect(exists('vendor/chrome-devtools-mcp')).resolves.toBe(false);
    });

    it('declares an unused-code scanner configured for extension entry points', async () => {
        const packageJson = await readJson('package.json');
        const knipConfig = await readJson('knip.json');

        expect(packageJson.scripts['lint:unused']).toBe('knip --no-progress');
        expect(packageJson.devDependencies.knip).toBeDefined();
        expect(knipConfig.entry).toEqual(
            expect.arrayContaining([
                'background/index.js',
                'sidepanel/index.html',
                'sidepanel/preload.js',
                'sandbox/index.html',
                'scripts/*.mjs',
                'scripts/*.test.js',
            ])
        );
        expect(knipConfig.project).toContain('**/*.{js,mjs,ts}');
        const ignoredFiles = knipConfig.ignore || [];
        expect(ignoredFiles).not.toEqual(
            expect.arrayContaining([
                'shared/constants.js',
                'shared/crop_utils.js',
                'shared/messaging.js',
                'shared/tool_call_text.js',
                'shared/utils.js',
                'shared/watermark_remover.js',
            ])
        );
    });
});
