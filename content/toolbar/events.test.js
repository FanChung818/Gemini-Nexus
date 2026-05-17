import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

async function installEvents() {
    await import('./events.js');
}

describe('ToolbarEvents', () => {
    let resizeObserverCallback;

    beforeEach(async () => {
        vi.resetModules();
        resizeObserverCallback = null;
        const dom = new JSDOM('<!doctype html><html><body></body></html>');
        globalThis.document = dom.window.document;
        globalThis.CustomEvent = dom.window.CustomEvent;
        globalThis.Event = dom.window.Event;
        globalThis.window = {};
        globalThis.ResizeObserver = class {
            constructor(callback) {
                resizeObserverCallback = callback;
            }
            observe() {}
            disconnect() {}
        };
        await installEvents();
    });

    it('binds the image translation menu item to the image_translate action', () => {
        const imageBtn = document.createElement('button');
        const imageTranslate = document.createElement('button');
        const askModelSelect = document.createElement('select');
        const askInput = document.createElement('input');
        const askWindow = document.createElement('div');
        const resultText = document.createElement('div');
        const triggerAction = vi.fn();

        const events = new window.GeminiToolbarEvents({
            actions: {
                triggerAction,
                cancelAsk: vi.fn(),
                stopAsk: vi.fn(),
            },
            handleImageClick: vi.fn(),
            handleImageHover: vi.fn(),
            handleModelChange: vi.fn(),
            isWindowVisible: vi.fn(() => false),
            isVisible: vi.fn(() => false),
            hide: vi.fn(),
            hideImageButton: vi.fn(),
            saveWindowDimensions: vi.fn(),
            codeCopy: {
                handle: vi.fn(),
            },
        });

        events.bind(
            {
                imageBtn,
                askInput,
                askModelSelect,
                askWindow,
                resultText,
                buttons: {
                    imageTranslate,
                },
            },
            askWindow
        );

        imageTranslate.click();

        expect(triggerAction).toHaveBeenCalledTimes(1);
        expect(triggerAction.mock.calls[0][1]).toBe('image_translate');
        events.disconnect();
    });

    it('saves the ask window dimensions after the visible window is resized', () => {
        const askModelSelect = document.createElement('select');
        const askInput = document.createElement('input');
        const askWindow = document.createElement('div');
        const resultText = document.createElement('div');
        const saveWindowDimensions = vi.fn();

        const events = new window.GeminiToolbarEvents({
            actions: {
                triggerAction: vi.fn(),
                cancelAsk: vi.fn(),
                stopAsk: vi.fn(),
            },
            handleImageClick: vi.fn(),
            handleImageHover: vi.fn(),
            handleModelChange: vi.fn(),
            isWindowVisible: vi.fn(() => true),
            isVisible: vi.fn(() => false),
            hide: vi.fn(),
            hideImageButton: vi.fn(),
            saveWindowDimensions,
            codeCopy: {
                handle: vi.fn(),
            },
        });

        events.bind(
            {
                askInput,
                askModelSelect,
                askWindow,
                resultText,
                buttons: {},
            },
            askWindow
        );

        resizeObserverCallback([
            {
                contentRect: {
                    width: 640,
                    height: 520,
                },
            },
        ]);

        expect(saveWindowDimensions).toHaveBeenCalledWith(640, 520);
        events.disconnect();
    });

    it('flips the image tools submenu left and clamps its vertical offset when it would overflow the viewport', () => {
        const imageBtn = document.createElement('button');
        const askModelSelect = document.createElement('select');
        const askInput = document.createElement('input');
        const askWindow = document.createElement('div');
        const resultText = document.createElement('div');
        const submenuTrigger = document.createElement('div');
        const submenu = document.createElement('div');

        submenuTrigger.className = 'has-submenu';
        submenu.className = 'submenu';
        submenuTrigger.appendChild(submenu);
        imageBtn.appendChild(submenuTrigger);
        document.body.appendChild(imageBtn);

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 180 });
        submenuTrigger.getBoundingClientRect = () => ({
            left: 250,
            right: 310,
            top: 140,
            bottom: 172,
            width: 60,
            height: 32,
        });
        submenu.getBoundingClientRect = () => ({
            left: 318,
            right: 498,
            top: 140,
            bottom: 300,
            width: 180,
            height: 160,
        });

        const events = new window.GeminiToolbarEvents({
            actions: {
                triggerAction: vi.fn(),
                cancelAsk: vi.fn(),
                stopAsk: vi.fn(),
            },
            handleImageClick: vi.fn(),
            handleImageHover: vi.fn(),
            handleModelChange: vi.fn(),
            isWindowVisible: vi.fn(() => false),
            isVisible: vi.fn(() => false),
            hide: vi.fn(),
            hideImageButton: vi.fn(),
            saveWindowDimensions: vi.fn(),
            codeCopy: {
                handle: vi.fn(),
            },
        });

        events.bind(
            {
                imageBtn,
                askInput,
                askModelSelect,
                askWindow,
                resultText,
                buttons: {},
            },
            askWindow
        );

        submenuTrigger.dispatchEvent(new Event('mouseenter'));

        expect(submenuTrigger.classList.contains('submenu-open-left')).toBe(true);
        expect(submenu.style.getPropertyValue('--submenu-offset-y')).toBe('-128px');
        events.disconnect();
    });
});
