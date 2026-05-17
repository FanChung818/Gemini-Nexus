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

    it('opens quick ask through the attached toolbar controller', () => {
        const controller = {
            showGlobalInput: vi.fn(),
        };
        window.GeminiShortcuts.setController(controller);

        document.dispatchEvent(createKeyboardEvent('G', { ctrlKey: true }));

        expect(controller.showGlobalInput).toHaveBeenCalledWith();
    });
});
