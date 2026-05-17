import { describe, expect, it } from 'vitest';

import {
    collectProjectSourceFiles,
    readJson,
    readProjectFile,
} from './project-structure/helpers.js';

describe('project code hygiene', () => {
    it('does not export helpers that are only used inside their own module', async () => {
        const webModels = await readProjectFile('shared/models/web_models.js');
        const sessionUtils = await readProjectFile('background/handlers/session/utils.js');
        const packageExtension = await readProjectFile('scripts/package-extension.mjs');

        expect(webModels).not.toMatch(/export function normalizeWebModel\s*\(/);
        expect(sessionUtils).not.toMatch(/export function createOfficialFunctionResponsePart\s*\(/);
        expect(packageExtension).not.toMatch(/export function getLocalDependencyAssets\s*\(/);
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
            const source = await readProjectFile(sourcePath);
            for (const action of retiredActions) {
                expect(source).not.toContain(action);
            }
        }
    });

    it('does not keep controller methods that only supported retired message actions', async () => {
        const appController = await readProjectFile('sandbox/controllers/app_controller.js');

        expect(appController).not.toMatch(/\bsetPageContext\s*\(/);
    });

    it('keeps content toolbar bindings scoped to controls rendered by the content toolbar', async () => {
        const events = await readProjectFile('content/toolbar/events.js');

        expect(events).not.toContain('browser-control-btn');
    });

    it('does not keep browser-control action wrapper methods without distinct behavior', async () => {
        const baseActionHandler = await readProjectFile('background/control/actions/base.js');

        expect(baseActionHandler).not.toMatch(/\bhighlightObjectId\s*\(/);
    });

    it('does not expose content toolbar template helpers that only back the rendered template getter', async () => {
        const templates = await readProjectFile('content/toolbar/templates.js');

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
            const source = await readProjectFile(file);
            expect(source).not.toMatch(/\b(isPinned|togglePin|isDocked)\b/);
        }
    });

    it('does not keep obsolete content toolbar HTML-mode render parameters', async () => {
        const view = await readProjectFile('content/toolbar/view/index.js');

        expect(view).not.toContain('isHtml');
    });

    it('does not keep unread content toolbar controller fields for self-bound DOM listeners', async () => {
        const uiManager = await readProjectFile('content/toolbar/ui/manager.js');
        const controller = await readProjectFile('content/toolbar/controller.js');

        expect(uiManager).not.toContain('toolbarDragController');
        expect(controller).not.toMatch(/\bthis\.(streamHandler|selectionObserver)\s*=/);
    });

    it('does not keep CSS selectors with no runtime or template producer', async () => {
        const toolbarCoreStyles = await readProjectFile('content/toolbar/styles/core.js');
        const settingsStyles = await readProjectFile('css/settings.css');

        expect(toolbarCoreStyles).not.toContain('loading-state');
        expect(toolbarCoreStyles).not.toMatch(/\.spinner\b/);
        expect(settingsStyles).not.toContain('setting-panel-note');
    });

    it('does not keep retired content toolbar icon constants', async () => {
        const icons = await readProjectFile('content/toolbar/icons.js');

        expect(icons).not.toMatch(/\b(PIN|PIN_FILLED|BRAIN):/);
    });

    it('keeps image preview styling in the toolbar style modules', async () => {
        const imagePreview = await readProjectFile('content/toolbar/view/image_preview.js');
        const panelBodyStyles = await readProjectFile('content/toolbar/styles/panel/body.js');

        expect(imagePreview).not.toContain('style.cssText');
        expect(panelBodyStyles).toContain('.gemini-image-preview');
    });

    it('keeps style ownership out of runtime DOM builders', async () => {
        const overlay = await readProjectFile('content/overlay.js');

        expect(overlay).not.toContain('style.cssText');
    });

    it('keeps parser protocol indexes named', async () => {
        const parser = await readProjectFile('services/parser.js');

        expect(parser).toContain('PAYLOAD_CANDIDATES_INDEX');
        expect(parser).toContain('CANDIDATE_THOUGHTS_INDEX');
        expect(parser).not.toContain('payload[4]');
        expect(parser).not.toContain('firstCandidate[37]');
    });

    it('keeps TypeScript config limited to options used by this codebase', async () => {
        const tsconfig = await readJson('tsconfig.json');
        const compilerOptions = tsconfig.compilerOptions || {};
        const viteConfig = await readProjectFile('vite.config.ts');

        expect(compilerOptions.experimentalDecorators).toBeUndefined();
        expect(compilerOptions.useDefineForClassFields).toBeUndefined();
        expect(compilerOptions.jsx).toBeUndefined();
        expect(compilerOptions.allowImportingTsExtensions).toBeUndefined();
        expect(compilerOptions.paths).toBeUndefined();
        expect(viteConfig).not.toContain('alias:');
    });

    it('uses explicit catchless syntax for intentionally ignored errors', async () => {
        const sourceFiles = [
            'sidepanel/preload.js',
            'sandbox/index.html',
            'sandbox/core/i18n.js',
            'services/providers/official.js',
            'services/providers/openai_compatible.js',
            'background/handlers/session/prompt/builder.js',
            'background/handlers/session/prompt_handler.js',
        ];

        for (const sourcePath of sourceFiles) {
            const source = await readProjectFile(sourcePath);
            expect(source, sourcePath).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
        }
    });

    it('keeps dormant debug output behind debugLog instead of commented console calls', async () => {
        const sourceFiles = [
            'background/control/connection.js',
            'background/managers/keep_alive.js',
        ];

        for (const sourcePath of sourceFiles) {
            const source = await readProjectFile(sourcePath);
            expect(source, sourcePath).not.toMatch(/\/\/\s*console\.(debug|log)/);
        }
    });

    it('keeps common comments free of typo drift', async () => {
        const appBoot = await readProjectFile('sandbox/boot/app.js');
        const sharedConstants = await readProjectFile('shared/config/constants.js');

        expect(appBoot).not.toContain('Bootstapping');
        expect(sharedConstants).not.toContain(['shared', 'constants.js'].join(''));
    });

    it('keeps deprecated phrases out of hygiene test literals', async () => {
        const hygieneTest = await readProjectFile('scripts/project-code-hygiene.test.js');
        const deprecatedPhrases = [
            ['shared', 'constants.js'].join(''),
            ['New Icons', 'for AI Tools'].join(' '),
            ['Optionally', 'style error'].join(' '),
            ['Remove', 'Watermark'].join(' '),
            ['Fixing', 'grammar'].join(' '),
        ];

        for (const phrase of deprecatedPhrases) {
            const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            expect(hygieneTest.match(new RegExp(escapedPhrase, 'g')) ?? [], phrase).toHaveLength(0);
        }
    });

    it('does not keep redundant source path banner comments', async () => {
        const sourceFiles = await collectProjectSourceFiles();

        for (const sourcePath of sourceFiles) {
            const source = await readProjectFile(sourcePath);
            const firstLine = source.split('\n')[0];

            expect(firstLine, sourcePath).not.toMatch(
                /^\/\/\s+(?=.*(?:^|[\s>])(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:js|mjs|ts)\b).*$/
            );
        }
    });

    it('keeps stale placeholder comments out of toolbar and message code', async () => {
        const icons = await readProjectFile('content/toolbar/icons.js');
        const messageHandler = await readProjectFile('sandbox/controllers/message_handler.js');

        expect(icons).not.toContain(['New Icons', 'for AI Tools'].join(' '));
        expect(messageHandler).not.toContain(['Optionally', 'style error'].join(' '));
    });

    it('keeps toolbar copy labels consistent', async () => {
        const strings = await readProjectFile('content/toolbar/i18n.js');

        expect(strings).not.toContain(['Remove', 'Watermark'].join(' '));
        expect(strings).not.toContain(['Fixing', 'grammar'].join(' '));
    });

    it('uses readable model option field names in UI option builders', async () => {
        const sourceFiles = [
            'shared/models/web_models.js',
            'content/toolbar/model_options.js',
            'sandbox/ui/model_options.js',
            'sandbox/ui/ui_controller.js',
            'content/toolbar/view/index.js',
            'content/toolbar/ui/manager.js',
        ];

        for (const sourcePath of sourceFiles) {
            const source = await readProjectFile(sourcePath);
            expect(source, sourcePath).not.toMatch(/\b(val|txt)\b/);
        }
    });

    it('uses readable setting callback value names', async () => {
        const sourceFiles = [
            'sandbox/ui/settings/view.js',
            'sandbox/ui/settings/index.js',
            'sandbox/ui/settings/sections/general.js',
        ];

        for (const sourcePath of sourceFiles) {
            const source = await readProjectFile(sourcePath);
            expect(source, sourcePath).not.toMatch(/\bval\b/);
        }
    });
});
