// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

function installControllerDependencies() {
    const uiInstance = {
        build: vi.fn(),
        setCallbacks: vi.fn(),
        updateModelList: vi.fn(),
        getProvider: vi.fn(() => 'web'),
        showAskWindow: vi.fn(),
        showError: vi.fn(),
        setCustomSelectionTools: vi.fn(),
        restoreTranslationTargets: vi.fn(),
    };

    window.GeminiToolbarUI = vi.fn(() => uiInstance);
    window.GeminiToolbarActions = vi.fn();
    window.GeminiSpeechReader = vi.fn(() => ({
        readSelection: vi.fn(),
        readPage: vi.fn(),
    }));
    window.GeminiImageDetector = vi.fn(() => ({
        init: vi.fn(),
        cancelHide: vi.fn(),
        scheduleHide: vi.fn(),
        setEnabled: vi.fn(),
    }));
    window.GeminiStreamHandler = vi.fn(() => ({ init: vi.fn() }));
    window.GeminiInputManager = vi.fn(() => ({
        capture: vi.fn(),
        reset: vi.fn(),
        hasSource: vi.fn(() => false),
    }));
    window.GeminiToolbarDispatcher = vi.fn();
    window.GeminiSelectionObserver = vi.fn();

    return uiInstance;
}

async function importController() {
    await import('./controller.js');
}

describe('GeminiToolbarController model persistence', () => {
    let ui;

    beforeEach(async () => {
        vi.resetModules();
        ui = installControllerDependencies();
        globalThis.chrome = {
            storage: {
                local: {
                    get: vi.fn(async () => ({
                        geminiProvider: 'web',
                        geminiModel: 'sidepanel-model',
                        geminiToolbarModel: 'toolbar-model',
                    })),
                    set: vi.fn(),
                },
                onChanged: {
                    addListener: vi.fn(),
                },
            },
            runtime: {
                sendMessage: vi.fn(),
            },
        };
        await importController();
    });

    it('restores the toolbar-specific model instead of the sidepanel model', async () => {
        new window.GeminiToolbarController();
        await Promise.resolve();

        expect(ui.updateModelList).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'web' }),
            'toolbar-model'
        );
    });

    it('restores the toolbar-specific provider instead of the sidepanel provider', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({
            geminiProvider: 'openai',
            geminiToolbarProvider: 'official',
            geminiModel: 'sidepanel-model',
            geminiToolbarModel: 'toolbar-api-model',
            geminiOfficialModel: 'toolbar-api-model, other-api-model',
        });

        new window.GeminiToolbarController();
        await Promise.resolve();

        expect(ui.updateModelList).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'official',
                officialModel: 'toolbar-api-model, other-api-model',
            }),
            'toolbar-api-model'
        );
    });

    it('keeps the current toolbar model UI when provider settings cannot be read', async () => {
        chrome.storage.local.get.mockRejectedValueOnce(new Error('Storage unavailable'));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            new window.GeminiToolbarController();
            await Promise.resolve();

            expect(ui.updateModelList).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                'Failed to sync toolbar provider/model settings:',
                'Storage unavailable'
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('saves toolbar model changes without overwriting the sidepanel model key', () => {
        const controller = new window.GeminiToolbarController();

        controller.handleModelChange('toolbar-model-2');

        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            geminiToolbarModel: 'toolbar-model-2',
        });
        expect(chrome.storage.local.set).not.toHaveBeenCalledWith({
            geminiModel: 'toolbar-model-2',
        });
    });

    it('saves toolbar provider changes without overwriting sidepanel provider keys', () => {
        const controller = new window.GeminiToolbarController();

        controller.handleProviderChange('official');

        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            geminiToolbarProvider: 'official',
        });
        expect(chrome.storage.local.set).not.toHaveBeenCalledWith({
            geminiProvider: 'official',
        });
        expect(chrome.storage.local.set).not.toHaveBeenCalledWith({
            geminiUseOfficialApi: true,
        });
    });

    it('saves OpenAI toolbar model changes in an OpenAI toolbar-specific key', () => {
        ui.getProvider.mockReturnValue('openai');
        const controller = new window.GeminiToolbarController();

        controller.handleModelChange('gpt-5.1');

        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            geminiToolbarOpenaiSelectedModel: 'gpt-5.1',
        });
        expect(chrome.storage.local.set).not.toHaveBeenCalledWith({
            geminiOpenaiSelectedModel: 'gpt-5.1',
        });
    });

    it('restores toolbar translation targets when imported settings update storage', () => {
        new window.GeminiToolbarController();
        const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];

        listener(
            {
                geminiTranslationTargets: {
                    oldValue: ['auto'],
                    newValue: ['ja'],
                },
            },
            'local'
        );

        expect(ui.restoreTranslationTargets).toHaveBeenCalled();
    });

    it('opens a lightweight input window for extension errors', () => {
        const controller = new window.GeminiToolbarController();

        controller.showExtensionError('Cannot open side panel');

        expect(ui.showAskWindow).toHaveBeenCalled();
        expect(ui.showError).toHaveBeenCalledWith('Cannot open side panel');
    });

    it('passes custom selection tools through to the toolbar UI', () => {
        const controller = new window.GeminiToolbarController();
        const tools = [{ id: 'formal', name: 'Formal', prompt: 'Rewrite: {text}' }];

        controller.setCustomSelectionTools(tools);

        expect(ui.setCustomSelectionTools).toHaveBeenCalledWith(tools);
    });
});
