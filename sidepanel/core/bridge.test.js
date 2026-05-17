// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageBridge } from './bridge.js';

function createFrame() {
    const sandboxWindow = {};
    return {
        getWindow: vi.fn(() => sandboxWindow),
        isWindow: vi.fn((source) => source === sandboxWindow),
        postMessage: vi.fn(),
    };
}

function createState() {
    return {
        getCurrentTabId: vi.fn(() => null),
        markUiReady: vi.fn(),
        save: vi.fn(),
        updateSessions: vi.fn(),
    };
}

describe('MessageBridge model persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.chrome = {
            runtime: {
                onMessage: { addListener: vi.fn() },
                sendMessage: vi.fn(() => Promise.resolve()),
            },
            storage: {
                local: {
                    get: vi.fn(),
                    set: vi.fn(),
                },
                session: {
                    get: vi.fn(),
                    set: vi.fn(),
                },
            },
            tabs: {
                create: vi.fn(),
            },
        };
    });

    it('saves OpenAI model selections in the OpenAI-specific preference key', () => {
        const frame = createFrame();
        const state = createState();
        const bridge = new MessageBridge(frame, state);

        bridge.handleWindowMessage({
            source: frame.getWindow(),
            data: {
                action: 'SAVE_MODEL',
                payload: {
                    provider: 'openai',
                    model: 'gpt-5',
                },
            },
        });

        expect(state.save).toHaveBeenCalledWith('geminiOpenaiSelectedModel', 'gpt-5');
        expect(state.save).not.toHaveBeenCalledWith('geminiModel', 'gpt-5');
    });

    it('keeps legacy string model saves on the global Gemini model key', () => {
        const frame = createFrame();
        const state = createState();
        const bridge = new MessageBridge(frame, state);

        bridge.handleWindowMessage({
            source: frame.getWindow(),
            data: {
                action: 'SAVE_MODEL',
                payload: 'gemini-3-flash',
            },
        });

        expect(state.save).toHaveBeenCalledWith('geminiModel', 'gemini-3-flash');
    });

    it('does not let a stale full-session save truncate a session updated in storage', async () => {
        const frame = createFrame();
        const state = createState();
        const bridge = new MessageBridge(frame, state);
        chrome.storage.local.get.mockImplementation((keys, callback) =>
            callback({
                geminiSessions: [
                    {
                        id: 'session-1',
                        title: 'Current',
                        timestamp: 200,
                        messages: [
                            { role: 'user', text: 'Hi' },
                            { role: 'ai', text: 'Hello' },
                        ],
                    },
                ],
            })
        );

        bridge.handleWindowMessage({
            source: frame.getWindow(),
            data: {
                action: 'SAVE_SESSIONS',
                payload: [
                    {
                        id: 'session-1',
                        title: 'Stale',
                        timestamp: 100,
                        messages: [{ role: 'user', text: 'Hi' }],
                    },
                ],
            },
        });

        await vi.waitFor(() =>
            expect(state.save).toHaveBeenCalledWith('geminiSessions', [
                expect.objectContaining({
                    id: 'session-1',
                    title: 'Current',
                    messages: [
                        { role: 'user', text: 'Hi' },
                        { role: 'ai', text: 'Hello' },
                    ],
                }),
            ])
        );
    });

    it('applies delete-session mutations against current storage and records a tombstone', async () => {
        const frame = createFrame();
        const state = createState();
        const bridge = new MessageBridge(frame, state);
        chrome.storage.local.get.mockImplementation((keys, callback) =>
            callback({
                geminiSessions: [
                    {
                        id: 'session-1',
                        title: 'Deleted',
                        messages: [{ role: 'user', text: 'Remove me' }],
                    },
                    {
                        id: 'session-2',
                        title: 'Keep',
                        messages: [{ role: 'user', text: 'Keep me' }],
                    },
                ],
                geminiDeletedSessionIds: {},
            })
        );

        bridge.handleWindowMessage({
            source: frame.getWindow(),
            data: {
                action: 'SAVE_SESSIONS',
                payload: {
                    sessions: [
                        {
                            id: 'session-2',
                            title: 'Keep',
                            messages: [{ role: 'user', text: 'Keep me' }],
                        },
                    ],
                    mutation: { type: 'deleteSession', sessionId: 'session-1' },
                },
            },
        });

        await vi.waitFor(() =>
            expect(state.save).toHaveBeenCalledWith('geminiSessions', [
                expect.objectContaining({ id: 'session-2' }),
            ])
        );
        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            geminiDeletedSessionIds: expect.objectContaining({
                'session-1': expect.any(Number),
            }),
        });
    });

    it('does not revive a tombstoned session from a stale legacy full-session save', async () => {
        const frame = createFrame();
        const state = createState();
        const bridge = new MessageBridge(frame, state);
        chrome.storage.local.get.mockImplementation((keys, callback) =>
            callback({
                geminiSessions: [],
                geminiDeletedSessionIds: { 'session-1': 123 },
            })
        );

        bridge.handleWindowMessage({
            source: frame.getWindow(),
            data: {
                action: 'SAVE_SESSIONS',
                payload: [
                    {
                        id: 'session-1',
                        title: 'Stale',
                        messages: [{ role: 'user', text: 'Old' }],
                    },
                ],
            },
        });

        await vi.waitFor(() => expect(state.save).toHaveBeenCalledWith('geminiSessions', []));
    });

    it('captures a selected display and forwards a still frame to the sandbox', async () => {
        const frame = createFrame();
        const state = createState();
        const bridge = new MessageBridge(frame, state);
        const track = { stop: vi.fn() };
        const drawImage = vi.fn();
        const video = {
            srcObject: null,
            videoWidth: 640,
            videoHeight: 360,
            play: vi.fn(() => Promise.resolve()),
            removeEventListener: vi.fn(),
            addEventListener: vi.fn((event, callback) => {
                if (event === 'loadedmetadata') callback();
            }),
        };
        const canvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({ drawImage })),
            toDataURL: vi.fn(() => 'data:image/png;base64,SCREEN'),
        };
        const originalCreateElement = document.createElement.bind(document);

        navigator.mediaDevices = {
            getDisplayMedia: vi.fn(() =>
                Promise.resolve({
                    getTracks: () => [track],
                })
            ),
        };
        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName === 'video') return video;
            if (tagName === 'canvas') return canvas;
            return originalCreateElement(tagName);
        });

        bridge.handleWindowMessage({
            source: frame.getWindow(),
            data: { action: 'REQUEST_SCREEN_CAPTURE' },
        });

        await vi.waitFor(() =>
            expect(frame.postMessage).toHaveBeenCalledWith({
                action: 'BACKGROUND_MESSAGE',
                payload: {
                    action: 'FETCH_IMAGE_RESULT',
                    base64: 'data:image/png;base64,SCREEN',
                    type: 'image/png',
                    name: 'screen_capture.png',
                },
            })
        );
        expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
            video: true,
            audio: false,
        });
        expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
        expect(track.stop).toHaveBeenCalled();
    });
});
