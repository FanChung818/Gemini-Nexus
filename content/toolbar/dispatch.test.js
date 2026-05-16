import { beforeEach, describe, expect, it, vi } from 'vitest';

async function installDispatcher() {
    await import('./dispatch.js');
}

describe('ToolbarDispatcher', () => {
    beforeEach(async () => {
        vi.resetModules();
        globalThis.window = {};
        await installDispatcher();
    });

    it('dispatches image text translation through the image translate prompt', () => {
        const rect = { left: 10, top: 20, width: 200, height: 120 };
        const controller = {
            ui: {
                getSelectedModel: vi.fn(() => 'gemini-3-pro'),
                hideImageButton: vi.fn(),
            },
            actions: {
                handleImagePrompt: vi.fn(),
            },
            imageDetector: {
                getCurrentImage: vi.fn(() => ({
                    src: 'data:image/png;base64,AAA',
                    getBoundingClientRect: () => rect,
                })),
            },
            inputManager: {},
            lastSessionId: 'previous-session',
        };

        new window.GeminiToolbarDispatcher(controller).dispatch('image_translate');

        expect(controller.ui.hideImageButton).toHaveBeenCalledTimes(1);
        expect(controller.lastSessionId).toBeNull();
        expect(controller.actions.handleImagePrompt).toHaveBeenCalledWith(
            'data:image/png;base64,AAA',
            rect,
            'translate',
            'gemini-3-pro'
        );
    });
});
