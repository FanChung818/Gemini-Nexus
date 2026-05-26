// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function installMessageRouter() {
    vi.resetModules();
    globalThis.chrome = {
        runtime: {
            onMessage: {
                addListener: vi.fn(),
            },
            sendMessage: vi.fn(),
        },
    };
    await import('./messages.js');
    return window.GeminiMessageRouter;
}

function createHarness() {
    return {
        overlay: {
            start: vi.fn(),
        },
        toolbar: {
            currentMode: 'ask',
            handleContextAction: vi.fn(),
            handleCropResult: vi.fn(),
            hideAll: vi.fn(),
            showExtensionError: vi.fn(),
        },
    };
}

describe('GeminiMessageRouter capture routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete window.GeminiMessageRouter;
    });

    it('forwards side panel crop failures back to the requesting side panel tab', async () => {
        const router = await installMessageRouter();
        const { overlay, toolbar } = createHarness();
        router.init(toolbar, overlay);

        const sendResponse = vi.fn();
        router.handle(
            {
                action: 'START_SELECTION',
                image: 'data:image/png;base64,AAAA',
                mode: 'snip',
                source: 'sidepanel',
                targetSidePanelTabId: 123,
            },
            {},
            sendResponse
        );
        router.handle(
            {
                action: 'CROP_SCREENSHOT_FAILED',
                error: 'Capture failed',
            },
            {},
            sendResponse
        );

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'SCREEN_CAPTURE_ERROR',
            error: 'Capture failed',
            tabId: 123,
        });
        expect(toolbar.showExtensionError).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenLastCalledWith({ status: 'ok' });
    });

    it('shows local crop failures in the floating toolbar', async () => {
        const router = await installMessageRouter();
        const { overlay, toolbar } = createHarness();
        router.init(toolbar, overlay);

        const sendResponse = vi.fn();
        router.handle(
            {
                action: 'START_SELECTION',
                image: 'data:image/png;base64,AAAA',
                mode: 'snip',
                source: 'local',
            },
            {},
            sendResponse
        );
        router.handle(
            {
                action: 'CROP_SCREENSHOT_FAILED',
                error: 'Capture failed',
            },
            {},
            sendResponse
        );

        expect(toolbar.showExtensionError).toHaveBeenCalledWith('Capture failed');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ action: 'SCREEN_CAPTURE_ERROR' })
        );
    });

    it('clears side panel capture routing when the selection overlay is cancelled', async () => {
        const router = await installMessageRouter();
        const { overlay, toolbar } = createHarness();
        router.init(toolbar, overlay);

        const sendResponse = vi.fn();
        router.handle(
            {
                action: 'START_SELECTION',
                image: 'data:image/png;base64,AAAA',
                mode: 'snip',
                source: 'sidepanel',
                targetSidePanelTabId: 123,
            },
            {},
            sendResponse
        );

        const [, options] = overlay.start.mock.calls[0];
        options.onCancel();
        router.handle(
            {
                action: 'CROP_SCREENSHOT',
                image: 'data:image/png;base64,BBBB',
                area: { x: 1, y: 2, width: 10, height: 20 },
            },
            {},
            sendResponse
        );

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ action: 'PROCESS_CROP_IN_SIDEPANEL' })
        );
        expect(toolbar.handleCropResult).toHaveBeenCalledWith({
            action: 'CROP_SCREENSHOT',
            image: 'data:image/png;base64,BBBB',
            area: { x: 1, y: 2, width: 10, height: 20 },
        });
    });
});
