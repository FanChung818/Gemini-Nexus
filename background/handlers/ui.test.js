import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UIMessageHandler } from './ui.js';

describe('UIMessageHandler browser control tab ownership', () => {
    let controlManager;
    let handler;

    beforeEach(() => {
        controlManager = {
            setOwnerSidePanelTabId: vi.fn(),
            enableControl: vi.fn(),
            disableControl: vi.fn(),
            setTargetTab: vi.fn(),
            isTabControllable: vi.fn(() => true),
        };
        handler = new UIMessageHandler({}, controlManager, null, null);
    });

    it('scopes browser control toggle broadcasts to the requesting side panel tab', () => {
        const sendResponse = vi.fn();

        const handled = handler.handle(
            {
                action: 'TOGGLE_BROWSER_CONTROL',
                enabled: true,
                sidePanelTabId: 123,
            },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        expect(controlManager.setOwnerSidePanelTabId).toHaveBeenCalledWith(123);
        expect(controlManager.enableControl).toHaveBeenCalledWith({ createDefaultTab: false });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'processed' });
    });

    it('asks browser control to create a default tab for standalone chat pages', () => {
        const sendResponse = vi.fn();

        const handled = handler.handle(
            {
                action: 'TOGGLE_BROWSER_CONTROL',
                enabled: true,
                hostIsTab: true,
                sidePanelTabId: 123,
            },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        expect(controlManager.setOwnerSidePanelTabId).toHaveBeenCalledWith(123);
        expect(controlManager.enableControl).toHaveBeenCalledWith({ createDefaultTab: true });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'processed' });
    });

    it('scopes manual tab switching broadcasts to the requesting side panel tab', async () => {
        const sendResponse = vi.fn();

        const handled = handler.handle(
            {
                action: 'SWITCH_TAB',
                tabId: 45,
                switchVisual: false,
                sidePanelTabId: 123,
            },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() => {
            expect(controlManager.setOwnerSidePanelTabId).toHaveBeenCalledWith(123);
            expect(controlManager.setTargetTab).toHaveBeenCalledWith(45);
            expect(sendResponse).toHaveBeenCalledWith({ status: 'switched' });
        });
    });

    it('does not manually switch browser control to an uncontrollable tab', async () => {
        controlManager.isTabControllable = vi.fn(() => Promise.resolve(false));
        const sendResponse = vi.fn();

        const handled = handler.handle(
            {
                action: 'SWITCH_TAB',
                tabId: 45,
                switchVisual: false,
                sidePanelTabId: 123,
            },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(sendResponse).toHaveBeenCalledWith({
                status: 'error',
                error: 'Tab cannot be controlled.',
            })
        );
        expect(controlManager.setTargetTab).not.toHaveBeenCalled();
    });

    it('returns only controlled group tabs while browser control is scoped', async () => {
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
            tabs: {
                query: vi.fn(({ groupId }) => {
                    if (groupId === 7) {
                        return Promise.resolve([
                            { id: 1, title: 'Inside', url: 'https://inside.test/' },
                        ]);
                    }
                    return Promise.resolve([
                        { id: 1, title: 'Inside', url: 'https://inside.test/' },
                        { id: 2, title: 'Outside', url: 'https://outside.test/' },
                    ]);
                }),
            },
        };
        controlManager.getControlledGroupId = vi.fn(() => 7);
        controlManager.getTargetTabId = vi.fn(() => 1);
        const sendResponse = vi.fn();

        const handled = handler.handle(
            { action: 'GET_OPEN_TABS', sidePanelTabId: 123 },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'OPEN_TABS_RESULT',
                    tabs: [expect.objectContaining({ id: 1, title: 'Inside' })],
                })
            )
        );
        expect(chrome.tabs.query).toHaveBeenCalledWith({ currentWindow: true, groupId: 7 });
    });

    it('returns tabs from the controlled popup window when the control scope has no group', async () => {
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
            tabs: {
                query: vi.fn(({ windowId }) => {
                    if (windowId === 55) {
                        return Promise.resolve([
                            { id: 9, title: 'Worker', url: 'https://worker.test/', windowId: 55 },
                        ]);
                    }
                    return Promise.resolve([
                        { id: 1, title: 'Main', url: 'https://main.test/', windowId: 1 },
                    ]);
                }),
            },
        };
        controlManager.getControlledGroupId = vi.fn(() => null);
        controlManager.getControlledWindowId = vi.fn(() => 55);
        controlManager.getTargetTabId = vi.fn(() => 9);
        const sendResponse = vi.fn();

        const handled = handler.handle(
            { action: 'GET_OPEN_TABS', sidePanelTabId: 123 },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'OPEN_TABS_RESULT',
                    tabs: [expect.objectContaining({ id: 9, title: 'Worker' })],
                })
            )
        );
        expect(chrome.tabs.query).toHaveBeenCalledWith({ windowId: 55 });
    });

    it('sends an empty open-tabs result to the side panel when tab lookup fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
            tabs: {
                query: vi.fn(() => Promise.reject(new Error('Tabs unavailable'))),
            },
        };
        controlManager.getTargetTabId = vi.fn(() => 1);
        const sendResponse = vi.fn();

        const handled = handler.handle(
            { action: 'GET_OPEN_TABS', sidePanelTabId: 123 },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                action: 'OPEN_TABS_RESULT',
                tabId: 123,
                tabs: [],
                lockedTabId: 1,
                error: 'Tabs unavailable',
            })
        );
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            error: 'Tabs unavailable',
        });
    });

    it('reports side panel open failures to the requesting content script', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        globalThis.chrome = {
            storage: {
                local: {
                    set: vi.fn(() => Promise.resolve()),
                    remove: vi.fn(() => Promise.resolve()),
                },
            },
            sidePanel: {
                open: vi.fn(() => Promise.reject(new Error('Panel unavailable'))),
                setOptions: vi.fn(() => Promise.resolve()),
            },
        };
        const sendResponse = vi.fn();
        const handler = new UIMessageHandler({}, controlManager, null, null);

        const handled = handler.handle(
            { action: 'OPEN_SIDE_PANEL' },
            { tab: { id: 9, windowId: 4 } },
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(sendResponse).toHaveBeenCalledWith({
                status: 'error',
                error: 'Panel unavailable',
            })
        );
    });

    it('clears pending side panel actions when opening the side panel fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        globalThis.chrome = {
            storage: {
                local: {
                    set: vi.fn(() => Promise.resolve()),
                    remove: vi.fn(() => Promise.resolve()),
                },
            },
            sidePanel: {
                open: vi.fn(() => Promise.reject(new Error('Panel unavailable'))),
                setOptions: vi.fn(() => Promise.resolve()),
            },
        };
        const sendResponse = vi.fn();
        const handler = new UIMessageHandler({}, controlManager, null, null);

        const handled = handler.handle(
            { action: 'OPEN_SIDE_PANEL', sessionId: 'session-1', mode: 'browser_control' },
            { tab: { id: 9, windowId: 4 } },
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(sendResponse).toHaveBeenCalledWith({
                status: 'error',
                error: 'Panel unavailable',
            })
        );
        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            pendingSessionId: 'session-1',
            pendingMode: 'browser_control',
        });
        expect(chrome.storage.local.remove).toHaveBeenCalledWith([
            'pendingSessionId',
            'pendingMode',
        ]);
    });

    it('reports browser control side panel open failures to the requester', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        globalThis.chrome = {
            storage: {
                local: {
                    set: vi.fn(() => Promise.resolve()),
                    remove: vi.fn(() => Promise.resolve()),
                },
            },
            sidePanel: {
                open: vi.fn(() => Promise.reject(new Error('Panel unavailable'))),
                setOptions: vi.fn(() => Promise.resolve()),
            },
        };
        controlManager.getTargetTabId = vi.fn(() => null);
        const sendResponse = vi.fn();
        const handler = new UIMessageHandler({}, controlManager, null, null);

        const handled = handler.handle(
            { action: 'TOGGLE_SIDE_PANEL_CONTROL' },
            { tab: { id: 9, windowId: 4 } },
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(sendResponse).toHaveBeenCalledWith({
                status: 'error',
                error: 'Panel unavailable',
            })
        );
    });

    it('reads selected text from the requesting side panel tab instead of the active tab', async () => {
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
            tabs: {
                get: vi.fn(() =>
                    Promise.resolve({
                        id: 123,
                        title: 'Side panel owner',
                        windowId: 8,
                        url: 'https://owner.test/',
                    })
                ),
                query: vi.fn(() =>
                    Promise.resolve([{ id: 999, title: 'Wrong active tab', windowId: 1 }])
                ),
                sendMessage: vi.fn(() => Promise.resolve({ selection: 'selected from owner' })),
            },
        };
        const sendResponse = vi.fn();
        const handler = new UIMessageHandler({}, controlManager, null, null);

        const handled = handler.handle(
            { action: 'GET_ACTIVE_SELECTION', sidePanelTabId: 123 },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
                action: 'GET_SELECTION',
            })
        );
        expect(chrome.tabs.query).not.toHaveBeenCalled();
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'SELECTION_RESULT',
            tabId: 123,
            text: 'selected from owner',
        });
    });

    it('starts area capture on the requesting side panel tab instead of the active tab', async () => {
        const imageHandler = {
            captureScreenshot: vi.fn(() =>
                Promise.resolve({
                    base64: 'data:image/png;base64,AAAA',
                })
            ),
        };
        globalThis.chrome = {
            tabs: {
                get: vi.fn(() =>
                    Promise.resolve({
                        id: 123,
                        title: 'Side panel owner',
                        windowId: 8,
                        url: 'https://owner.test/',
                    })
                ),
                query: vi.fn(() =>
                    Promise.resolve([{ id: 999, title: 'Wrong active tab', windowId: 1 }])
                ),
                sendMessage: vi.fn(() => Promise.resolve()),
            },
        };
        const sendResponse = vi.fn();
        const handler = new UIMessageHandler(imageHandler, controlManager, null, null);

        const handled = handler.handle(
            {
                action: 'INITIATE_CAPTURE',
                mode: 'snip',
                source: 'sidepanel',
                sidePanelTabId: 123,
            },
            {},
            sendResponse
        );

        expect(handled).toBe(false);
        await vi.waitFor(() => expect(imageHandler.captureScreenshot).toHaveBeenCalledWith(8));
        expect(chrome.tabs.query).not.toHaveBeenCalled();
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
            action: 'START_SELECTION',
            image: 'data:image/png;base64,AAAA',
            mode: 'snip',
            source: 'sidepanel',
            targetSidePanelTabId: 123,
        });
    });

    it('reports side panel area capture start failures without opening the selection overlay', async () => {
        const imageHandler = {
            captureScreenshot: vi.fn(() =>
                Promise.resolve({
                    error: 'Capture failed',
                })
            ),
        };
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
            tabs: {
                get: vi.fn(() =>
                    Promise.resolve({
                        id: 123,
                        windowId: 8,
                        url: 'https://owner.test/',
                    })
                ),
                query: vi.fn(() => Promise.resolve([])),
                sendMessage: vi.fn(() => Promise.resolve()),
            },
        };
        const handler = new UIMessageHandler(imageHandler, controlManager, null, null);

        const handled = handler.handle(
            {
                action: 'INITIATE_CAPTURE',
                mode: 'snip',
                source: 'sidepanel',
                sidePanelTabId: 123,
            },
            {},
            vi.fn()
        );

        expect(handled).toBe(false);
        await vi.waitFor(() =>
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                action: 'SCREEN_CAPTURE_ERROR',
                error: 'Capture failed',
                tabId: 123,
            })
        );
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
            123,
            expect.objectContaining({ action: 'START_SELECTION' })
        );
    });

    it('reports local area capture start failures to the content script', async () => {
        const imageHandler = {
            captureScreenshot: vi.fn(() =>
                Promise.resolve({
                    error: 'Capture failed',
                })
            ),
        };
        globalThis.chrome = {
            tabs: {
                query: vi.fn(() => Promise.resolve([{ id: 9, title: 'Active', windowId: 4 }])),
                sendMessage: vi.fn(() => Promise.resolve()),
            },
        };
        const handler = new UIMessageHandler(imageHandler, controlManager, null, null);

        const handled = handler.handle(
            {
                action: 'INITIATE_CAPTURE',
                mode: 'snip',
                source: 'local',
            },
            {},
            vi.fn()
        );

        expect(handled).toBe(false);
        await vi.waitFor(() =>
            expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(9, {
                action: 'SHOW_EXTENSION_ERROR',
                message: 'Capture failed',
            })
        );
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
            9,
            expect.objectContaining({ action: 'START_SELECTION' })
        );
    });

    it('notifies the content script when area capture fails after selection', async () => {
        const imageHandler = {
            captureArea: vi.fn(() => Promise.resolve(null)),
        };
        globalThis.chrome = {
            tabs: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
        };
        const sendResponse = vi.fn();
        const handler = new UIMessageHandler(imageHandler, controlManager, null, null);

        const handled = handler.handle(
            {
                action: 'AREA_SELECTED',
                area: { x: 1, y: 2, width: 10, height: 20 },
            },
            { tab: { id: 9, windowId: 4 } },
            sendResponse
        );

        expect(handled).toBe(true);
        await vi.waitFor(() =>
            expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(9, {
                action: 'CROP_SCREENSHOT_FAILED',
                error: 'Capture failed',
            })
        );
        expect(sendResponse).toHaveBeenCalledWith({ status: 'completed' });
    });
});
