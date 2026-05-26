import { BrowserConnection } from '../control/connection.js';
import { SnapshotManager } from '../control/snapshot/index.js';
import { BrowserActions } from '../control/actions/index.js';
import { ToolDispatcher } from '../control/dispatcher.js';
import { getTabControlAvailability, toControlTabSummary } from '../control/tabs.js';
import { debugLog } from '../../shared/logging/debug.js';

export const DEFAULT_BROWSER_CONTROL_START_URL = 'https://www.google.com/search?q=';

/**
 * Main Controller handling Chrome DevTools MCP functionalities.
 * Orchestrates connection, snapshots, and action execution.
 */
export class BrowserControlManager {
    constructor() {
        this.connection = new BrowserConnection();
        this.snapshotManager = new SnapshotManager(this.connection);
        this.actions = new BrowserActions(this.connection, this.snapshotManager, {
            getControlledGroupId: () => this.getControlledGroupId(),
            getControlledWindowId: () => this.getControlledWindowId(),
        });
        this.dispatcher = new ToolDispatcher(this.actions, this.snapshotManager);
        this.lockedTabId = null;
        this.ownerSidePanelTabId = null;
        this.controlGroupTabId = null;
        this.controlGroupId = null;
        this.controlWindowId = null;
        this.nativeGroupDisabledForTabId = null;
        this.controlTaskTitle = 'Browser control';

        this.connection.onDetach(() => {
            this._broadcastCurrentLockState();
        });

        // Listen for updates to the locked tab (URL/Favicon changes)
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (tabId === this.lockedTabId) {
                // If the update contains relevant info, broadcast it
                if (changeInfo.favIconUrl || changeInfo.title || changeInfo.url) {
                    this._broadcastLockState(tab);
                }
            }
        });

        // Listen for closure of the locked tab
        chrome.tabs.onRemoved.addListener((tabId) => {
            if (tabId === this.lockedTabId) {
                this.setTargetTab(null);
            }
        });
    }

    setTargetTab(tabId, options = {}) {
        this.lockedTabId = tabId;
        this.connection.targetTabId = Number.isInteger(tabId) && tabId > 0 ? tabId : null;
        debugLog(`[ControlManager] Target tab locked to: ${tabId}`);

        if (tabId) {
            const requestedTabId = tabId;
            // Fetch tab info to broadcast state immediately
            chrome.tabs
                .get(tabId)
                .then((tab) => {
                    if (this.lockedTabId !== requestedTabId) return;
                    if (options.skipNativeGroup === true) {
                        this.nativeGroupDisabledForTabId = tab.id;
                    } else if (this.nativeGroupDisabledForTabId === tab.id) {
                        this.nativeGroupDisabledForTabId = null;
                    }
                    this._applyNativeTabGroup(tab, {
                        skipNativeGroup: options.skipNativeGroup === true,
                    });
                    this._broadcastLockState(tab);
                })
                .catch(() => {
                    if (this.lockedTabId !== requestedTabId) return;
                    // Tab might have closed or invalid ID
                    this.lockedTabId = null;
                    this.connection.targetTabId = null;
                    this._broadcastLockState(null);
                });
        } else {
            this._clearNativeTabGroup();
            this.controlWindowId = null;
            this.nativeGroupDisabledForTabId = null;
            this._broadcastLockState(null);
        }
    }

    setControlTaskTitle(title) {
        const normalized = String(title || '').trim();
        this.controlTaskTitle = normalized ? normalized.slice(0, 32) : 'Browser control';
        if (this.lockedTabId) {
            this._broadcastCurrentLockState();
        }
    }

    setOwnerSidePanelTabId(tabId) {
        this.ownerSidePanelTabId = Number.isInteger(tabId) && tabId > 0 ? tabId : null;
    }

    _broadcastLockState(tab) {
        const summary = toControlTabSummary(tab);
        const attached =
            summary && this.connection.attached && this.connection.currentTabId === summary.id;
        chrome.runtime
            .sendMessage({
                action: 'TAB_LOCKED',
                tabId: this.ownerSidePanelTabId,
                tab: summary,
                attached: attached === true,
            })
            .catch(() => {});
    }

    _broadcastCurrentLockState() {
        if (!this.lockedTabId) {
            this._broadcastLockState(null);
            return;
        }

        chrome.tabs
            .get(this.lockedTabId)
            .then((tab) => {
                if (this.lockedTabId !== tab.id) return;
                this._applyNativeTabGroup(tab, {
                    skipNativeGroup: this.nativeGroupDisabledForTabId === tab.id,
                });
                this._broadcastLockState(tab);
            })
            .catch(() => this._broadcastLockState(null));
    }

    _rememberControlledWindow(tab) {
        if (Number.isInteger(tab?.windowId) && tab.windowId > 0) {
            this.controlWindowId = tab.windowId;
        }
    }

    async _applyNativeTabGroup(tab, { skipNativeGroup = false } = {}) {
        const previousWindowId = this.getControlledWindowId();
        this._rememberControlledWindow(tab);

        if (skipNativeGroup) {
            await this._clearNativeTabGroup();
            return;
        }

        if (!tab?.id || !chrome.tabs?.group || !chrome.tabGroups?.update) {
            this.controlGroupId = null;
            this.controlGroupTabId = null;
            return;
        }

        this.controlGroupTabId = tab.id;
        try {
            let existingGroupId = this.getControlledGroupId();
            if (
                existingGroupId !== null &&
                Number.isInteger(previousWindowId) &&
                Number.isInteger(tab.windowId) &&
                previousWindowId !== tab.windowId
            ) {
                await this._clearNativeTabGroup();
                existingGroupId = null;
            }
            const groupRequest =
                existingGroupId === null
                    ? { tabIds: [tab.id] }
                    : { groupId: existingGroupId, tabIds: [tab.id] };
            const groupId = await chrome.tabs.group(groupRequest);
            await chrome.tabGroups.update(groupId, {
                title: this.controlTaskTitle,
                color: 'green',
                collapsed: false,
            });
            this.controlGroupId = groupId;
        } catch (error) {
            if (this.controlGroupTabId === tab.id) {
                this.controlGroupTabId = null;
                this.controlGroupId = null;
            }
            debugLog('[ControlManager] Could not apply tab group indicator:', error);
        }
    }

    async _clearNativeTabGroup(tabId = this.controlGroupTabId) {
        const groupId = this.getControlledGroupId();
        if ((!tabId && groupId === null) || !chrome.tabs?.ungroup) {
            this.controlGroupTabId = null;
            this.controlGroupId = null;
            return;
        }

        try {
            let tabIds = tabId ? [tabId] : [];
            if (groupId !== null && chrome.tabs?.query) {
                const query = { groupId };
                const windowId = this.getControlledWindowId();
                if (windowId !== null) query.windowId = windowId;
                const tabs = await chrome.tabs.query(query);
                tabIds = tabs.map((tab) => tab.id).filter((id) => Number.isInteger(id) && id > 0);
                if (tabIds.length === 0 && tabId) tabIds = [tabId];
            }
            if (tabIds.length > 0) {
                await chrome.tabs.ungroup(tabIds.length === 1 ? tabIds[0] : tabIds);
            }
        } catch (error) {
            debugLog('[ControlManager] Could not clear tab group indicator:', error);
        } finally {
            this.controlGroupTabId = null;
            this.controlGroupId = null;
        }
    }

    getControlledGroupId() {
        return Number.isInteger(this.controlGroupId) && this.controlGroupId >= 0
            ? this.controlGroupId
            : null;
    }

    getControlledWindowId() {
        return Number.isInteger(this.controlWindowId) && this.controlWindowId > 0
            ? this.controlWindowId
            : null;
    }

    async isTabInControlledGroup(tabId) {
        const groupId = this.getControlledGroupId();
        if (!Number.isInteger(tabId) || tabId <= 0) return false;

        try {
            if (groupId !== null) {
                const query = { groupId };
                const windowId = this.getControlledWindowId();
                if (windowId !== null) query.windowId = windowId;
                const tabs = await chrome.tabs.query(query);
                return tabs.some((tab) => tab.id === tabId);
            }

            const windowId = this.getControlledWindowId();
            if (windowId === null) return true;
            const tab = await chrome.tabs.get(tabId);
            return tab.windowId === windowId;
        } catch {
            return false;
        }
    }

    async isTabControllable(tabId) {
        if (!Number.isInteger(tabId) || tabId <= 0) return false;

        try {
            const tab = await chrome.tabs.get(tabId);
            return getTabControlAvailability(tab).controllable;
        } catch {
            return false;
        }
    }

    getTargetTabId() {
        return this.lockedTabId;
    }

    async _getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return tab || null;
    }

    async _createDefaultControlTab() {
        const activeTab = await this._getActiveTab().catch(() => null);
        const createOptions = {
            url: DEFAULT_BROWSER_CONTROL_START_URL,
            active: false,
        };
        if (Number.isInteger(activeTab?.windowId) && activeTab.windowId > 0) {
            createOptions.windowId = activeTab.windowId;
        }

        return await chrome.tabs.create(createOptions);
    }

    async _ensureControllableTarget({ createDefaultTab = false } = {}) {
        if (this.lockedTabId) {
            try {
                const lockedTab = await chrome.tabs.get(this.lockedTabId);
                if (getTabControlAvailability(lockedTab).controllable) {
                    this.connection.targetTabId = lockedTab.id;
                    this._rememberControlledWindow(lockedTab);
                    return lockedTab;
                }
            } catch (error) {
                console.warn('[ControlManager] Locked tab not found, clearing lock.', error);
            }

            this.lockedTabId = null;
            this.connection.targetTabId = null;
        }

        if (createDefaultTab && chrome.tabs?.create) {
            const defaultTab = await this._createDefaultControlTab();
            if (defaultTab?.id) {
                this.setTargetTab(defaultTab.id);
                this._rememberControlledWindow(defaultTab);
                return defaultTab;
            }
        }

        const activeTab = await this._getActiveTab().catch(() => null);
        if (activeTab?.id && getTabControlAvailability(activeTab).controllable) {
            this.setTargetTab(activeTab.id);
            this._rememberControlledWindow(activeTab);
            return activeTab;
        }

        return null;
    }

    // --- Control Lifecycle ---

    async enableControl(options = {}) {
        // If already connected, do nothing (or verify tab)
        if (this.connection.attached && this.lockedTabId === this.connection.currentTabId) {
            return true;
        }

        await this._ensureControllableTarget({
            createDefaultTab: options.createDefaultTab === true,
        });

        // Force attachment which shows the "Started debugging" bar
        const enabled = await this.ensureConnection();
        this._broadcastCurrentLockState();
        return enabled;
    }

    async disableControl() {
        // Clear lock
        this.setTargetTab(null);
        this.ownerSidePanelTabId = null;
        // Detach debugger which hides the bar
        if (this.connection.attached) {
            await this.connection.detach();
        }
    }

    // --- Internal Helpers ---

    async ensureConnection() {
        const targetTab = await this._ensureControllableTarget();
        if (!targetTab?.id) return false;
        const tabId = targetTab.id;

        // Perform quick check on URL before attaching
        let tabObj;
        try {
            tabObj = await chrome.tabs.get(tabId);
        } catch {
            return false;
        }

        const availability = getTabControlAvailability(tabObj);
        if (!availability.controllable) {
            // Fail silently for restricted pages to avoid log noise
            return false;
        }

        const attached = await this.connection.attach(tabId);
        this._broadcastCurrentLockState();
        return attached === true && this.connection.attached === true;
    }

    async ensureTargetReference() {
        const tab = await this._ensureControllableTarget();
        return Boolean(tab?.id);
    }

    async getSnapshot() {
        if (!this.connection.attached || this.connection.currentTabId !== this.lockedTabId) {
            const success = await this.ensureConnection();
            // Check connection.attached explicitly.
            if (!success || !this.connection.attached) return null;
        }
        return await this.snapshotManager.takeSnapshot();
    }

    // --- Execution Entry Point ---

    async execute(toolCall) {
        try {
            const { name, args } = toolCall;
            const requiresDebugger = ToolDispatcher.requiresDebugger(name);
            const success = requiresDebugger
                ? await this.ensureConnection()
                : await this.ensureTargetReference();

            // Check attached status as well to be safe
            if (requiresDebugger && (!success || !this.connection.attached)) {
                return 'Error: No active tab found, restricted URL, or debugger disconnected.';
            }

            debugLog(`[MCP] Running tool: ${name}`, args);

            // Delegate to dispatcher
            const result = await this.dispatcher.dispatch(name, args);

            let finalOutput = result;

            // Handle metadata objects returned by tools (e.g. NavigationActions)
            if (result && typeof result === 'object') {
                if (result._meta && result._meta.switchTabId) {
                    const nextTabId = result._meta.switchTabId;
                    if (
                        !result._meta.allowOutsideControlledGroup &&
                        !(await this.isTabInControlledGroup(nextTabId))
                    ) {
                        return 'Error: Target tab is outside the controlled tab group.';
                    }
                    this.setTargetTab(nextTabId, {
                        skipNativeGroup: result._meta.allowOutsideControlledGroup === true,
                    });
                }

                // If it has an 'output' property (standardized wrapper), return that string.
                // Otherwise return the object as is (e.g. screenshot { text, image }).
                if ('output' in result) {
                    finalOutput = result.output;
                }
            }

            return finalOutput;
        } catch (error) {
            console.error(`[MCP] Tool execution error:`, error);
            return `Error executing ${toolCall.name}: ${error.message}`;
        }
    }
}
