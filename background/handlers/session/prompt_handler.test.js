import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasInlinePageSnapshot, PromptHandler } from './prompt_handler.js';
import { appendAiMessage } from '../../managers/history_manager.js';

vi.mock('../../managers/history_manager.js', () => ({
    appendAiMessage: vi.fn(),
    appendAiMessageIfDisplayable: vi.fn(),
    appendRawMessages: vi.fn(),
    appendUserMessage: vi.fn(),
    replaceSessionSnapshot: vi.fn(),
}));

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('PromptHandler concurrency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
        };
    });

    it('cancels and notifies a superseded prompt without accepting its late success', async () => {
        const first = deferred();
        const second = deferred();
        const sessionManager = {
            handleSendPrompt: vi
                .fn()
                .mockImplementationOnce(() => first.promise)
                .mockImplementationOnce(() => second.promise),
        };
        const handler = new PromptHandler(sessionManager, null, null);
        const firstResponse = vi.fn();
        const secondResponse = vi.fn();

        handler.handle(
            {
                action: 'SEND_PROMPT',
                text: 'first',
                model: 'gemini-test',
                sessionId: 'session-1',
            },
            firstResponse
        );
        await vi.waitFor(() => expect(sessionManager.handleSendPrompt).toHaveBeenCalledTimes(1));

        handler.handle(
            {
                action: 'SEND_PROMPT',
                text: 'second',
                model: 'gemini-test',
                sessionId: 'session-2',
            },
            secondResponse
        );
        await vi.waitFor(() => expect(sessionManager.handleSendPrompt).toHaveBeenCalledTimes(2));

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'GEMINI_REPLY',
                sessionId: 'session-1',
                status: 'cancelled',
            })
        );

        first.resolve({
            action: 'GEMINI_REPLY',
            sessionId: 'session-1',
            status: 'success',
            text: 'late first result',
        });
        second.resolve({
            action: 'GEMINI_REPLY',
            sessionId: 'session-2',
            status: 'success',
            text: 'second result',
        });
        await flushPromises();

        expect(appendAiMessage).not.toHaveBeenCalledWith(
            'session-1',
            expect.objectContaining({ text: 'late first result' })
        );
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'GEMINI_REPLY',
                sessionId: 'session-1',
                status: 'success',
            })
        );
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'GEMINI_REPLY',
                sessionId: 'session-2',
                status: 'success',
            })
        );
        expect(firstResponse).toHaveBeenCalledWith({ status: 'completed' });
        expect(secondResponse).toHaveBeenCalledWith({ status: 'completed' });
    });

    it('uses the user browser-control prompt as the native tab group title', async () => {
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
            tabs: {
                query: vi.fn(() =>
                    Promise.resolve([
                        {
                            id: 88,
                            title: 'OpenAI News | OpenAI',
                            url: 'https://openai.com/news/',
                            active: true,
                        },
                    ])
                ),
            },
        };
        const sessionManager = {
            handleSendPrompt: vi.fn(() =>
                Promise.resolve({
                    action: 'GEMINI_REPLY',
                    sessionId: 'session-1',
                    status: 'success',
                    text: 'done',
                })
            ),
        };
        const controlManager = {
            setOwnerSidePanelTabId: vi.fn(),
            setControlTaskTitle: vi.fn(),
            getTargetTabId: vi.fn(() => null),
            setTargetTab: vi.fn(),
            getSnapshot: vi.fn(() => Promise.resolve('snapshot')),
        };
        const handler = new PromptHandler(sessionManager, controlManager, null);
        const sendResponse = vi.fn();

        handler.handle(
            {
                action: 'SEND_PROMPT',
                text: 'Scroll OpenAI news',
                model: 'gemini-test',
                sessionId: 'session-1',
                enableBrowserControl: true,
                sidePanelTabId: 123,
            },
            sendResponse
        );

        await vi.waitFor(() =>
            expect(controlManager.setControlTaskTitle).toHaveBeenCalledWith('Scroll OpenAI news')
        );
        expect(controlManager.setTargetTab).toHaveBeenCalledWith(88);
    });
});

describe('PromptHandler browser-control snapshot detection', () => {
    it('detects inline snapshots already returned by browser-control tools', () => {
        expect(
            hasInlinePageSnapshot('Clicked element 1_2\n\n## Latest page snapshot\nuid=2_1')
        ).toBe(true);
        expect(hasInlinePageSnapshot('Clicked element 1_2')).toBe(false);
    });
});
