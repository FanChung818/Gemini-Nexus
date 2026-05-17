import { beforeEach, describe, expect, it, vi } from 'vitest';

function installToolbarStrings() {
    window.GeminiToolbarStrings = {
        titles: {
            ocr: 'OCR',
            translate: 'Translate',
            analyze: 'Analyze',
            upscale: 'Upscale',
            expand: 'Expand',
            removeText: 'Remove text',
            removeBg: 'Remove background',
            removeWatermark: 'Remove watermark',
            snip: 'Snip',
            textTranslate: 'Text translate',
            summarize: 'Summarize',
            grammar: 'Grammar',
            explain: 'Explain',
        },
        prompts: {
            ocr: 'ocr prompt',
            imageTranslate: 'translate prompt',
            analyze: 'analyze prompt',
            upscale: 'upscale prompt',
            expand: 'expand prompt',
            removeText: 'remove text prompt',
            removeBg: 'remove background prompt',
            removeWatermark: 'remove watermark prompt',
            snipAnalyze: 'snip prompt',
            textTranslate: (selection) => `translate ${selection}`,
            summarize: (selection) => `summarize ${selection}`,
            grammar: (selection) => `grammar ${selection}`,
            explain: (selection) => `explain ${selection}`,
        },
        loading: {
            ocr: 'loading ocr',
            translate: 'loading translate',
            analyze: 'loading analyze',
            upscale: 'loading upscale',
            expand: 'loading expand',
            removeText: 'loading remove text',
            removeBg: 'loading remove background',
            removeWatermark: 'loading remove watermark',
            snip: 'loading snip',
            summarize: 'loading summarize',
            grammar: 'loading grammar',
            regenerate: 'loading regenerate',
        },
        inputs: {
            ocr: 'input ocr',
            translate: 'input translate',
            analyze: 'input analyze',
            upscale: 'input upscale',
            expand: 'input expand',
            removeText: 'input remove text',
            removeBg: 'input remove background',
            removeWatermark: 'input remove watermark',
            snip: 'input snip',
            textTranslate: 'input text translate',
            summarize: 'input summarize',
            grammar: 'input grammar',
            explain: 'input explain',
        },
        errors: {
            imageEditWebOnly: 'Image editing requires Gemini Web.',
        },
    };
}

async function installToolbarActions() {
    await import('./actions.js');
}

describe('ToolbarActions', () => {
    beforeEach(async () => {
        vi.resetModules();
        globalThis.window = {};
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(),
            },
        };
        installToolbarStrings();
        window.GeminiWebModels = {
            resolveImagePromptModel: ({ provider, mode, model }) =>
                provider === 'web' && mode === 'remove_bg'
                    ? 'gemini-3-pro-image-preview-11-2025'
                    : model,
        };
        await installToolbarActions();
    });

    it('keeps Web image-generation retries on the resolved image model', async () => {
        const ui = {
            provider: 'web',
            showAskWindow: vi.fn(async () => {}),
            showLoading: vi.fn(),
            setInputValue: vi.fn(),
            getSelectedModel: vi.fn(() => 'gemini-3-pro'),
        };
        const actions = new window.GeminiToolbarActions(ui);

        await actions.handleImagePrompt(
            'data:image/png;base64,AAA',
            { x: 1, y: 2 },
            'remove_bg',
            'gemini-3-pro'
        );

        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(chrome.runtime.sendMessage.mock.lastCall[0]).toEqual(
            expect.objectContaining({
                action: 'QUICK_ASK_IMAGE',
                imageMode: 'remove_bg',
                model: 'gemini-3-pro-image-preview-11-2025',
            })
        );
        chrome.runtime.sendMessage.mockClear();

        actions.handleRetry();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(chrome.runtime.sendMessage.mock.lastCall[0]).toEqual(
            expect.objectContaining({
                action: 'QUICK_ASK_IMAGE',
                imageMode: 'remove_bg',
                model: 'gemini-3-pro-image-preview-11-2025',
            })
        );
    });

    it('waits for user text before sending image chat', async () => {
        const ui = {
            provider: 'web',
            showAskWindow: vi.fn(async () => {}),
            showLoading: vi.fn(),
            setInputValue: vi.fn(),
            getSelectedModel: vi.fn(() => 'gemini-3-pro'),
        };
        const actions = new window.GeminiToolbarActions(ui);

        await actions.handleImageChat('data:image/png;base64,AAA', { x: 1, y: 2 });

        expect(ui.showAskWindow).toHaveBeenCalledWith({ x: 1, y: 2 }, null, 'Analyze');
        expect(ui.setInputValue).toHaveBeenCalledWith('');
        expect(ui.showLoading).not.toHaveBeenCalled();
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

        actions.handleSubmitAsk('What is this?', '', null, 'gemini-3-pro');

        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(chrome.runtime.sendMessage.mock.lastCall[0]).toEqual({
            action: 'QUICK_ASK_IMAGE',
            url: 'data:image/png;base64,AAA',
            text: 'What is this?',
            model: 'gemini-3-pro',
            imageMode: 'chat',
            sessionId: null,
        });
    });

    it('shows an error instead of sending image editing requests outside Gemini Web', async () => {
        const ui = {
            provider: 'official',
            showAskWindow: vi.fn(async () => {}),
            showLoading: vi.fn(),
            showError: vi.fn(),
            setInputValue: vi.fn(),
            getSelectedModel: vi.fn(() => 'gemini-3.1-pro-preview'),
        };
        const actions = new window.GeminiToolbarActions(ui);

        await actions.handleImagePrompt(
            'data:image/png;base64,AAA',
            { x: 1, y: 2 },
            'remove_bg',
            'gemini-3.1-pro-preview'
        );

        expect(ui.showAskWindow).toHaveBeenCalledWith({ x: 1, y: 2 }, null, 'Remove background');
        expect(ui.setInputValue).toHaveBeenCalledWith('input remove background');
        expect(ui.showLoading).not.toHaveBeenCalled();
        expect(ui.showError).toHaveBeenCalledWith('Image editing requires Gemini Web.');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
});
