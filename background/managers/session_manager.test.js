import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiSessionManager } from './session_manager.js';
import { getConnectionSettings } from './session/settings_store.js';

vi.mock('./session/settings_store.js', () => ({
    getConnectionSettings: vi.fn(),
}));

function createAbortError() {
    return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('GeminiSessionManager cancellation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getConnectionSettings.mockResolvedValue({ provider: 'official' });
        globalThis.chrome = {
            i18n: {
                getUILanguage: vi.fn(() => 'en'),
            },
        };
    });

    it('returns a cancellation reply when a request is aborted', async () => {
        const manager = new GeminiSessionManager();
        manager.dispatcher = {
            dispatch: vi.fn((request, settings, files, onUpdate, signal) => {
                return new Promise((resolve, reject) => {
                    signal.addEventListener('abort', () => reject(createAbortError()));
                });
            }),
        };

        const resultPromise = manager.handleSendPrompt(
            { text: 'first', sessionId: 'session-1' },
            vi.fn()
        );
        await vi.waitFor(() => expect(manager.dispatcher.dispatch).toHaveBeenCalledTimes(1));

        expect(manager.cancelCurrentRequest()).toBe(true);

        await expect(resultPromise).resolves.toEqual(
            expect.objectContaining({
                action: 'GEMINI_REPLY',
                sessionId: 'session-1',
                status: 'cancelled',
            })
        );
    });

    it('does not let an aborted request clear a newer request controller', async () => {
        const manager = new GeminiSessionManager();
        let secondResolve;
        manager.dispatcher = {
            dispatch: vi.fn((request, settings, files, onUpdate, signal) => {
                if (request.sessionId === 'session-2') {
                    return new Promise((resolve, reject) => {
                        secondResolve = resolve;
                        signal.addEventListener('abort', () => reject(createAbortError()));
                    });
                }

                return new Promise((resolve, reject) => {
                    signal.addEventListener('abort', () => reject(createAbortError()));
                });
            }),
        };

        const firstPromise = manager.handleSendPrompt(
            { text: 'first', sessionId: 'session-1' },
            vi.fn()
        );
        await vi.waitFor(() => expect(manager.dispatcher.dispatch).toHaveBeenCalledTimes(1));

        const secondPromise = manager.handleSendPrompt(
            { text: 'second', sessionId: 'session-2' },
            vi.fn()
        );
        await vi.waitFor(() => expect(manager.dispatcher.dispatch).toHaveBeenCalledTimes(2));
        await firstPromise;
        await flushPromises();

        try {
            expect(manager.cancelCurrentRequest()).toBe(true);
        } finally {
            if (secondResolve) {
                secondResolve({
                    action: 'GEMINI_REPLY',
                    sessionId: 'session-2',
                    status: 'success',
                    text: 'second result',
                });
            }
            await secondPromise;
        }
    });
});
