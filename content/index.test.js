// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function installContentIndex(storageResult, options = {}) {
    vi.resetModules();
    window.history.replaceState(null, '', '/docs/page');

    let storageChanged;
    const controller = {
        setSelectionEnabled: vi.fn(),
        setImageToolsEnabled: vi.fn(),
        setCustomSelectionTools: vi.fn(),
    };
    const router = { init: vi.fn() };
    const shortcuts = { setController: vi.fn() };

    window.GeminiNexusPageGuard = { isDisabled: false };
    window.GeminiMessageRouter = router;
    window.GeminiShortcuts = shortcuts;
    window.GeminiNexusOverlay = vi.fn();
    window.GeminiToolbarController = vi.fn(() => controller);

    globalThis.chrome = {
        runtime: {
            lastError: null,
        },
        storage: {
            local: {
                get: vi.fn((keys, callback) => {
                    if (options.storageReadError) {
                        chrome.runtime.lastError = { message: options.storageReadError };
                    }
                    callback(storageResult);
                    chrome.runtime.lastError = null;
                }),
            },
            onChanged: {
                addListener: vi.fn((listener) => {
                    storageChanged = listener;
                }),
            },
        },
    };

    await import('./selection_blacklist.js');
    await import('./settings_sync.js');
    await import('./index.js');

    return { controller, storageChanged };
}

describe('content index text selection blacklist', () => {
    beforeEach(() => {
        delete window.GeminiSelectionBlacklist;
        delete window.GeminiContentSettingsSync;
        delete window.GeminiNexusContentReady;
    });

    it('disables selection toolbar on blacklisted current pages', async () => {
        const { controller } = await installContentIndex({
            geminiTextSelectionEnabled: true,
            geminiTextSelectionBlacklist: 'localhost/docs',
        });

        expect(controller.setSelectionEnabled).toHaveBeenCalledWith(false);
    });

    it('recomputes selection toolbar availability when blacklist changes', async () => {
        const { controller, storageChanged } = await installContentIndex({
            geminiTextSelectionEnabled: true,
            geminiTextSelectionBlacklist: '',
        });

        controller.setSelectionEnabled.mockClear();
        storageChanged(
            {
                geminiTextSelectionBlacklist: { newValue: 'localhost/docs' },
            },
            'local'
        );

        expect(controller.setSelectionEnabled).toHaveBeenCalledWith(false);
    });

    it('marks the page as initialized so startup injection can avoid duplicates', async () => {
        const { controller } = await installContentIndex({
            geminiTextSelectionEnabled: true,
            geminiTextSelectionBlacklist: '',
        });

        expect(window.GeminiNexusContentReady).toBe(true);
        expect(controller.setSelectionEnabled).toHaveBeenCalledWith(true);
    });

    it('loads and hot-updates custom selection tools', async () => {
        const tools = [{ id: 'formal', name: 'Formal', prompt: 'Rewrite: {text}' }];
        const { controller, storageChanged } = await installContentIndex({
            geminiTextSelectionEnabled: true,
            geminiTextSelectionBlacklist: '',
            geminiCustomSelectionTools: tools,
        });

        expect(controller.setCustomSelectionTools).toHaveBeenCalledWith(tools);

        const nextTools = [{ id: 'explain', name: 'Explain code', prompt: 'Explain:\n{text}' }];
        storageChanged(
            {
                geminiCustomSelectionTools: { newValue: nextTools },
            },
            'local'
        );

        expect(controller.setCustomSelectionTools).toHaveBeenLastCalledWith(nextTools);
    });

    it('keeps current toolbar state when the initial settings read fails', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            const { controller } = await installContentIndex(
                {
                    geminiTextSelectionEnabled: false,
                    geminiTextSelectionBlacklist: '',
                    geminiCustomSelectionTools: [{ id: 'formal' }],
                    geminiImageToolsEnabled: false,
                },
                { storageReadError: 'Storage unavailable' }
            );

            expect(controller.setSelectionEnabled).not.toHaveBeenCalled();
            expect(controller.setImageToolsEnabled).not.toHaveBeenCalled();
            expect(controller.setCustomSelectionTools).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                'Failed to load content toolbar settings:',
                'Storage unavailable'
            );
        } finally {
            warnSpy.mockRestore();
        }
    });
});
