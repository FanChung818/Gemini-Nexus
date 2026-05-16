import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserControlManager } from './control_manager.js';

function setupChrome() {
    globalThis.chrome = {
        debugger: {
            onEvent: { addListener: vi.fn() },
            onDetach: { addListener: vi.fn() },
            attach: vi.fn((target, version, callback) => callback()),
            sendCommand: vi.fn((target, method, params, callback) => callback({})),
        },
        runtime: {
            sendMessage: vi.fn(() => Promise.resolve()),
        },
        tabs: {
            get: vi.fn(() =>
                Promise.resolve({
                    id: 42,
                    title: 'OpenAI News | OpenAI',
                    url: 'https://openai.com/news/',
                    active: true,
                })
            ),
            onUpdated: { addListener: vi.fn() },
            onRemoved: { addListener: vi.fn() },
        },
        tabGroups: {
            update: vi.fn(() => Promise.resolve()),
        },
    };
}

describe('BrowserControlManager native tab group indicator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupChrome();
    });

    it('groups the controlled tab with a green task title', async () => {
        chrome.tabs.group = vi.fn(() => Promise.resolve(9));
        const manager = new BrowserControlManager();

        manager.setControlTaskTitle('Scroll OpenAI news');
        manager.setTargetTab(42);
        await Promise.resolve();
        await Promise.resolve();

        expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [42] });
        expect(chrome.tabGroups.update).toHaveBeenCalledWith(9, {
            title: 'Scroll OpenAI news',
            color: 'green',
            collapsed: false,
        });
    });

    it('ungroups the previously controlled tab when control stops', async () => {
        chrome.tabs.group = vi.fn(() => Promise.resolve(9));
        chrome.tabs.ungroup = vi.fn(() => Promise.resolve());
        const manager = new BrowserControlManager();

        manager.setTargetTab(42);
        await Promise.resolve();
        await Promise.resolve();

        manager.setTargetTab(null);
        await Promise.resolve();

        expect(chrome.tabs.ungroup).toHaveBeenCalledWith(42);
    });

    it('keeps previously controlled tabs in the same group when switching control targets', async () => {
        chrome.tabs.group = vi.fn(({ groupId, tabIds }) =>
            Promise.resolve(Number.isInteger(groupId) ? groupId : 9)
        );
        const manager = new BrowserControlManager();

        manager.setTargetTab(42);
        await Promise.resolve();
        await Promise.resolve();

        chrome.tabs.get = vi.fn(() =>
            Promise.resolve({
                id: 77,
                title: 'Second tab',
                url: 'https://second.test/',
                active: false,
            })
        );

        manager.setTargetTab(77);
        await Promise.resolve();
        await Promise.resolve();

        expect(chrome.tabs.group).toHaveBeenNthCalledWith(1, { tabIds: [42] });
        expect(chrome.tabs.group).toHaveBeenNthCalledWith(2, { groupId: 9, tabIds: [77] });
    });

    it('does not fail when tab group APIs are unavailable', async () => {
        delete chrome.tabs.group;
        delete chrome.tabGroups;
        const manager = new BrowserControlManager();

        expect(() => manager.setTargetTab(42)).not.toThrow();
        await Promise.resolve();
    });

    it('rejects switching control to a tab outside the controlled group', async () => {
        chrome.tabs.group = vi.fn(() => Promise.resolve(9));
        chrome.tabs.query = vi.fn(({ groupId }) => {
            if (groupId === 9) {
                return Promise.resolve([{ id: 42, title: 'Inside', url: 'https://inside.test/' }]);
            }
            return Promise.resolve([]);
        });
        const manager = new BrowserControlManager();
        manager.dispatcher.dispatch = vi.fn(() =>
            Promise.resolve({
                output: 'Selected outside',
                _meta: { switchTabId: 99 },
            })
        );
        manager.connection.attached = true;
        manager.connection.currentTabId = 42;
        manager.lockedTabId = 42;
        manager.controlGroupId = 9;

        const result = await manager.execute({ name: 'select_page', args: { index: 1 } });

        expect(result).toBe('Error: Target tab is outside the controlled tab group.');
        expect(manager.lockedTabId).toBe(42);
    });

    it('allows tool-created popup tabs to become the controlled target outside the current group', async () => {
        chrome.tabs.group = vi.fn(() => Promise.resolve(9));
        chrome.tabs.query = vi.fn(({ groupId }) => {
            if (groupId === 9) {
                return Promise.resolve([{ id: 42, title: 'Inside', url: 'https://inside.test/' }]);
            }
            return Promise.resolve([]);
        });
        const manager = new BrowserControlManager();
        manager.dispatcher.dispatch = vi.fn(() =>
            Promise.resolve({
                output: 'Created worker',
                _meta: { switchTabId: 99, allowOutsideControlledGroup: true },
            })
        );
        manager.connection.attached = true;
        manager.connection.currentTabId = 42;
        manager.lockedTabId = 42;
        manager.controlGroupId = 9;

        const result = await manager.execute({ name: 'new_page', args: { background: true } });

        expect(result).toBe('Created worker');
        expect(manager.lockedTabId).toBe(99);
    });

    it('runs page-management tools even when the current tab cannot attach a debugger', async () => {
        const manager = new BrowserControlManager();
        manager.ensureConnection = vi.fn(() => Promise.resolve(false));
        manager.dispatcher.dispatch = vi.fn(() =>
            Promise.resolve('0: Extensions (chrome://extensions/)')
        );
        manager.lockedTabId = 42;

        const result = await manager.execute({ name: 'list_pages', args: {} });

        expect(result).toBe('0: Extensions (chrome://extensions/)');
        expect(manager.dispatcher.dispatch).toHaveBeenCalledWith('list_pages', {});
    });

    it('keeps the intended target on the connection when locking without debugger attachment', () => {
        const manager = new BrowserControlManager();

        manager.setTargetTab(42);

        expect(manager.connection.targetTabId).toBe(42);
    });

    it('does not force background popup tabs into the existing native tab group', async () => {
        chrome.tabs.group = vi.fn(() => Promise.resolve(9));
        chrome.tabs.get = vi.fn((tabId) =>
            Promise.resolve({
                id: tabId,
                title: tabId === 99 ? 'Worker' : 'Inside',
                url: `https://${tabId}.test/`,
                active: false,
                windowId: tabId === 99 ? 55 : 1,
            })
        );
        const manager = new BrowserControlManager();
        manager.dispatcher.dispatch = vi.fn(() =>
            Promise.resolve({
                output: 'Created worker',
                _meta: { switchTabId: 99, allowOutsideControlledGroup: true },
            })
        );
        manager.connection.attached = true;
        manager.connection.currentTabId = 42;
        manager.lockedTabId = 42;
        manager.controlGroupId = 9;
        manager.controlWindowId = 1;

        const result = await manager.execute({ name: 'new_page', args: { background: true } });
        await Promise.resolve();

        expect(result).toBe('Created worker');
        expect(manager.lockedTabId).toBe(99);
        expect(manager.getControlledGroupId()).toBe(null);
        expect(manager.getControlledWindowId()).toBe(55);
        expect(chrome.tabs.group).not.toHaveBeenCalled();
    });

    it('reattaches before taking a snapshot when the locked tab changed', async () => {
        const manager = new BrowserControlManager();
        const attach = vi.spyOn(manager.connection, 'attach').mockImplementation(async (tabId) => {
            manager.connection.attached = true;
            manager.connection.currentTabId = tabId;
        });
        manager.snapshotManager.takeSnapshot = vi.fn(() => Promise.resolve('new snapshot'));
        manager.connection.attached = true;
        manager.connection.currentTabId = 42;
        manager.lockedTabId = 77;

        const snapshot = await manager.getSnapshot();

        expect(attach).toHaveBeenCalledWith(77);
        expect(snapshot).toBe('new snapshot');
    });

    it('does not enable retired diagnostics domains when attaching debugger', async () => {
        const manager = new BrowserControlManager();

        await manager.connection.attach(42);

        const enabledMethods = chrome.debugger.sendCommand.mock.calls.map((call) => call[1]);
        expect(enabledMethods).toContain('Runtime.enable');
        expect(enabledMethods).toContain('Page.enable');
        expect(enabledMethods).toContain('Target.setAutoAttach');
        expect(enabledMethods).not.toContain('Network.enable');
        expect(enabledMethods).not.toContain('Log.enable');
        expect(enabledMethods).not.toContain('Audits.enable');
    });
});
