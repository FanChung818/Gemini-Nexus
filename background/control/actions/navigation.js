import { BaseActionHandler } from './base.js';

export class NavigationActions extends BaseActionHandler {
    constructor(connection, snapshotManager, waitHelper, groupContext = {}) {
        super(connection, snapshotManager, waitHelper);
        this.groupContext = groupContext;
    }

    getControlledGroupId() {
        const groupId = this.groupContext.getControlledGroupId?.();
        return Number.isInteger(groupId) && groupId >= 0 ? groupId : null;
    }

    getScopedTabQuery() {
        const windowId = this.getControlledWindowId();
        const query = windowId === null ? { currentWindow: true } : { windowId };
        const groupId = this.getControlledGroupId();
        if (groupId !== null) query.groupId = groupId;
        return query;
    }

    async getScopedTabs() {
        return await chrome.tabs.query(this.getScopedTabQuery());
    }

    async addTabToControlledGroup(tabId) {
        const groupId = this.getControlledGroupId();
        if (groupId === null || !chrome.tabs?.group) return;
        await chrome.tabs.group({ groupId, tabIds: [tabId] });
    }

    getControlledWindowId() {
        const windowId = this.groupContext.getControlledWindowId?.();
        return Number.isInteger(windowId) && windowId > 0 ? windowId : null;
    }

    async navigatePage({ url, type }) {
        // Use currentTabId (attached) or fallback to targetTabId (intent)
        const tabId = this.connection.targetTabId || this.connection.currentTabId;
        if (!tabId) return 'Error: No target tab identified.';

        let action = '';

        await this.waitHelper.execute(async () => {
            if (type === 'back') {
                await chrome.tabs.goBack(tabId);
                action = 'Navigated back';
            } else if (type === 'forward') {
                await chrome.tabs.goForward(tabId);
                action = 'Navigated forward';
            } else if (type === 'reload') {
                await chrome.tabs.reload(tabId);
                action = 'Reloaded page';
            } else if (url) {
                await chrome.tabs.update(tabId, { url });
                action = `Navigating to ${url}`;
            }
        });

        return action || 'Error: Invalid navigation arguments.';
    }

    async newPage({ url, background = false }) {
        const targetUrl = url || 'about:blank';
        let tab;

        if (background) {
            // Use an unfocused popup to avoid throttling and visual interference.
            const popupWindow = await chrome.windows.create({
                url: targetUrl,
                type: 'popup',
                focused: false,
                width: 1280,
                height: 800,
            });
            tab = popupWindow.tabs[0];
        } else {
            const createOptions = { url: targetUrl };
            const windowId = this.getControlledWindowId();
            if (windowId !== null) createOptions.windowId = windowId;
            tab = await chrome.tabs.create(createOptions);
            await this.addTabToControlledGroup(tab.id);
        }

        // Return object with metadata so ControlManager can update the locked tab
        return {
            output: `Created new page (id: ${tab.id}) loading ${targetUrl}`,
            _meta: {
                switchTabId: tab.id,
                allowOutsideControlledGroup: background === true,
            },
        };
    }

    async closePage({ index }) {
        if (index === undefined) return "Error: 'index' is required.";
        const tabs = await this.getScopedTabs();
        const tab = tabs[index];
        if (!tab) return `Error: Page index ${index} not found.`;

        await chrome.tabs.remove(tab.id);
        return `Closed page ${index}: ${tab.title || 'Untitled'}`;
    }

    async listPages() {
        const tabs = await this.getScopedTabs();
        return tabs.map((tab, index) => `${index}: ${tab.title} (${tab.url})`).join('\n');
    }

    async selectPage({ index }) {
        const tabs = await this.getScopedTabs();
        const tab = tabs[index];
        if (!tab) return `Error: Index ${index} not found.`;

        // Return metadata so ControlManager can update the locked tab without forcing focus.
        return {
            output: `Selected page ${index} (Background Mode): ${tab.title}`,
            _meta: { switchTabId: tab.id },
        };
    }
}
