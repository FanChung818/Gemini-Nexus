// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function installShortcuts() {
    await import('./shortcuts.js');
}

function createKeyboardEvent(key, modifiers = {}) {
    return new KeyboardEvent('keydown', {
        key,
        ctrlKey: modifiers.ctrlKey === true,
        altKey: modifiers.altKey === true,
        shiftKey: modifiers.shiftKey === true,
        metaKey: modifiers.metaKey === true,
        bubbles: true,
        cancelable: true,
    });
}

describe('ShortcutManager', () => {
    let storageChangeListener;

    beforeEach(async () => {
        vi.resetModules();
        delete window.GeminiNexusPageGuard;
        storageChangeListener = null;
        globalThis.chrome = {
            storage: {
                local: {
                    get: vi.fn((keys, callback) => callback({})),
                },
                onChanged: {
                    addListener: vi.fn((listener) => {
                        storageChangeListener = listener;
                    }),
                },
            },
            runtime: {
                lastError: null,
                sendMessage: vi.fn(),
            },
        };

        await installShortcuts();
    });

    it('matches configured shortcuts by key and modifiers', () => {
        const shortcuts = window.GeminiShortcuts;

        expect(shortcuts.match(createKeyboardEvent('G', { ctrlKey: true }), 'Ctrl+G')).toBe(true);
        expect(shortcuts.match(createKeyboardEvent('g', { ctrlKey: true }), 'Ctrl+G')).toBe(true);
        expect(shortcuts.match(createKeyboardEvent('G', { altKey: true }), 'Ctrl+G')).toBe(false);
        expect(shortcuts.match(createKeyboardEvent('G', { ctrlKey: true }), 'Ctrl+Alt+G')).toBe(
            false
        );
    });

    it('opens the side panel for the configured shortcut', () => {
        const event = createKeyboardEvent('S', { altKey: true });

        document.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'OPEN_SIDE_PANEL' });
    });

    it('updates shortcuts from storage changes', () => {
        storageChangeListener(
            {
                geminiShortcuts: {
                    newValue: {
                        openPanel: 'Ctrl+O',
                    },
                },
            },
            'local'
        );

        document.dispatchEvent(createKeyboardEvent('O', { ctrlKey: true }));

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'OPEN_SIDE_PANEL' });
    });

    it('restores default shortcuts when the stored shortcut config is removed', () => {
        storageChangeListener(
            {
                geminiShortcuts: {
                    newValue: {
                        openPanel: 'Ctrl+O',
                    },
                },
            },
            'local'
        );
        storageChangeListener(
            {
                geminiShortcuts: {
                    newValue: undefined,
                },
            },
            'local'
        );

        document.dispatchEvent(createKeyboardEvent('O', { ctrlKey: true }));
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

        document.dispatchEvent(createKeyboardEvent('S', { altKey: true }));
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'OPEN_SIDE_PANEL' });
    });

    it('does not enable default shortcuts when the initial shortcut read fails', async () => {
        vi.resetModules();
        storageChangeListener = null;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        chrome.storage.local.get.mockImplementation((keys, callback) => {
            chrome.runtime.lastError = { message: 'Storage unavailable' };
            callback({});
            chrome.runtime.lastError = null;
        });
        chrome.runtime.sendMessage.mockClear();

        try {
            await installShortcuts();

            document.dispatchEvent(createKeyboardEvent('S', { altKey: true }));

            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                'Failed to load Gemini Nexus shortcuts:',
                'Storage unavailable'
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('opens quick ask through the attached toolbar controller', () => {
        const controller = {
            showGlobalInput: vi.fn(),
        };
        window.GeminiShortcuts.setController(controller);

        document.dispatchEvent(createKeyboardEvent('G', { ctrlKey: true }));

        expect(controller.showGlobalInput).toHaveBeenCalledWith();
    });

    it('starts local OCR capture for the configured shortcut', () => {
        const event = createKeyboardEvent('O', { altKey: true });

        document.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'INITIATE_CAPTURE',
            mode: 'ocr',
            source: 'local',
        });
    });

    it('does not intercept page shortcuts while typing in editable fields', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        const event = createKeyboardEvent('B', { ctrlKey: true });
        input.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('shows toolbar feedback when opening the side panel fails', async () => {
        chrome.runtime.sendMessage = vi.fn(() =>
            Promise.resolve({ status: 'error', error: 'No side panel' })
        );
        const controller = {
            showGlobalInput: vi.fn(),
            showExtensionError: vi.fn(),
        };
        window.GeminiShortcuts.setController(controller);

        document.dispatchEvent(createKeyboardEvent('S', { altKey: true }));
        await Promise.resolve();

        expect(controller.showExtensionError).toHaveBeenCalledWith('No side panel');
    });

    it('does not attach shortcut listeners when the page guard disables the content script', async () => {
        vi.resetModules();
        window.GeminiNexusPageGuard = { isDisabled: true, reason: 'mhtml' };
        delete window.GeminiShortcuts;
        const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
        chrome.storage.local.get.mockClear();
        chrome.storage.onChanged.addListener.mockClear();
        chrome.runtime.sendMessage.mockClear();

        await installShortcuts();

        expect(window.GeminiShortcuts).toBeUndefined();
        expect(chrome.storage.local.get).not.toHaveBeenCalled();
        expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
        expect(addEventListenerSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function), true);
        addEventListenerSpy.mockRestore();
    });
});
