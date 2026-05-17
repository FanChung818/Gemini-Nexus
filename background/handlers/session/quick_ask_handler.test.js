import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAskHandler } from './quick_ask_handler.js';
import { appendTurnToHistory, saveToHistory } from '../../managers/history_manager.js';

vi.mock('../../managers/history_manager.js', () => ({
    appendTurnToHistory: vi.fn(),
    saveToHistory: vi.fn(),
}));

describe('QuickAskHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.chrome = {
            tabs: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
        };
    });

    it('streams text updates and final session id for quick ask requests', async () => {
        saveToHistory.mockResolvedValue({ id: 'saved-session' });
        const sessionManager = {
            resetContext: vi.fn(),
            ensureInitialized: vi.fn(),
            handleSendPrompt: vi.fn(async (request, onUpdate) => {
                onUpdate('partial text', 'partial thoughts');
                return { status: 'success', text: 'final text', thoughts: 'done' };
            }),
        };
        const handler = new QuickAskHandler(sessionManager, {});

        await handler.handleQuickAsk({ text: 'hello', model: 'gemini-test' }, { tab: { id: 42 } });

        expect(sessionManager.resetContext).toHaveBeenCalled();
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
            action: 'GEMINI_STREAM_UPDATE',
            text: 'partial text',
            thoughts: 'partial thoughts',
        });
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
            action: 'GEMINI_STREAM_DONE',
            result: { status: 'success', text: 'final text', thoughts: 'done' },
            sessionId: 'saved-session',
        });
    });

    it('appends continuing quick ask turns to the existing session instead of creating a new one', async () => {
        appendTurnToHistory.mockResolvedValue({ id: 'existing-session' });
        const sessionManager = {
            resetContext: vi.fn(),
            ensureInitialized: vi.fn(),
            handleSendPrompt: vi.fn(async () => ({
                status: 'success',
                text: 'follow-up answer',
                thoughts: null,
            })),
        };
        const handler = new QuickAskHandler(sessionManager, {});

        await handler.handleQuickAsk(
            { text: 'follow-up question', model: 'gemini-test', sessionId: 'existing-session' },
            { tab: { id: 42 } }
        );

        expect(sessionManager.resetContext).not.toHaveBeenCalled();
        expect(sessionManager.ensureInitialized).toHaveBeenCalled();
        expect(saveToHistory).not.toHaveBeenCalled();
        expect(appendTurnToHistory).toHaveBeenCalledWith(
            'existing-session',
            'follow-up question',
            {
                status: 'success',
                text: 'follow-up answer',
                thoughts: null,
            },
            null
        );
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
            action: 'GEMINI_STREAM_DONE',
            result: { status: 'success', text: 'follow-up answer', thoughts: null },
            sessionId: 'existing-session',
        });
    });

    it('streams image quick ask errors as done messages', async () => {
        const sessionManager = {
            resetContext: vi.fn(),
            handleSendPrompt: vi.fn(),
        };
        const imageHandler = {
            fetchImage: vi.fn(async () => ({ error: 'not found' })),
        };
        const handler = new QuickAskHandler(sessionManager, imageHandler);

        await handler.handleQuickAskImage(
            { text: 'describe', url: 'https://example.test/image.png' },
            { tab: { id: 7 } }
        );

        expect(sessionManager.handleSendPrompt).not.toHaveBeenCalled();
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
            action: 'GEMINI_STREAM_DONE',
            result: { status: 'error', text: 'Failed to load image: not found' },
        });
    });

    it('keeps only the primary generated image for image editing quick asks', async () => {
        saveToHistory.mockResolvedValue({ id: 'saved-edit-session' });
        const sessionManager = {
            resetContext: vi.fn(),
            handleSendPrompt: vi.fn(async () => ({
                status: 'success',
                text: '',
                images: [
                    { url: 'https://lh3.googleusercontent.com/generated-primary' },
                    { url: 'https://lh3.googleusercontent.com/generated-duplicate' },
                    { url: 'https://lh3.googleusercontent.com/original-reference' },
                ],
            })),
        };
        const imageHandler = {
            fetchImage: vi.fn(async () => ({
                base64: 'data:image/png;base64,AAAA',
                type: 'image/png',
                name: 'image.png',
            })),
        };
        const handler = new QuickAskHandler(sessionManager, imageHandler);

        await handler.handleQuickAskImage(
            {
                text: 'remove background',
                url: 'data:image/png;base64,AAAA',
                model: 'gemini-3-pro-image-preview-11-2025',
                imageMode: 'remove_bg',
            },
            { tab: { id: 7 } }
        );

        const expectedResult = {
            status: 'success',
            text: '',
            images: [{ url: 'https://lh3.googleusercontent.com/generated-primary' }],
        };
        expect(saveToHistory).toHaveBeenCalledWith('remove background', expectedResult, [
            { base64: 'data:image/png;base64,AAAA' },
        ]);
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
            action: 'GEMINI_STREAM_DONE',
            result: expectedResult,
            sessionId: 'saved-edit-session',
        });
    });

    it('removes parsed images from OCR quick ask results', async () => {
        saveToHistory.mockResolvedValue({ id: 'saved-ocr-session' });
        const sessionManager = {
            resetContext: vi.fn(),
            handleSendPrompt: vi.fn(async () => ({
                status: 'success',
                text: '音王到里雯\nAIHI MANGA',
                images: [{ url: 'https://lh3.googleusercontent.com/original-reference' }],
            })),
        };
        const imageHandler = {
            fetchImage: vi.fn(async () => ({
                base64: 'data:image/png;base64,AAAA',
                type: 'image/png',
                name: 'image.png',
            })),
        };
        const handler = new QuickAskHandler(sessionManager, imageHandler);

        await handler.handleQuickAskImage(
            {
                text: 'extract text',
                url: 'data:image/png;base64,AAAA',
                model: 'gemini-3-flash',
                imageMode: 'ocr',
            },
            { tab: { id: 7 } }
        );

        const expectedResult = {
            status: 'success',
            text: '音王到里雯\nAIHI MANGA',
            images: [],
        };
        expect(saveToHistory).toHaveBeenCalledWith('extract text', expectedResult, [
            { base64: 'data:image/png;base64,AAAA' },
        ]);
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
            action: 'GEMINI_STREAM_DONE',
            result: expectedResult,
            sessionId: 'saved-ocr-session',
        });
    });
});
