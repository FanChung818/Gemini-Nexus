import { getActiveTabContent } from './session/utils.js';
import { getPanelPathForTab } from '../managers/sidepanel_scope_manager.js';
import { toControlTabSummary } from '../control/tabs.js';

export class UIMessageHandler {
    constructor(imageHandler, controlManager, mcpManager, sidePanelScopeManager) {
        this.imageHandler = imageHandler;
        this.controlManager = controlManager;
        this.mcpManager = mcpManager;
        this.sidePanelScopeManager = sidePanelScopeManager;
    }

    handle(request, sender, sendResponse) {
        // --- IMAGE FETCHING (USER INPUT) ---
        if (request.action === 'FETCH_IMAGE') {
            (async () => {
                try {
                    const result = await this.imageHandler.fetchImage(request.url);
                    chrome.runtime
                        .sendMessage({
                            ...result,
                            tabId: this._getTargetSidePanelTabId(request, sender),
                        })
                        .catch(() => {});
                } catch (error) {
                    console.error('Fetch image error', error);
                } finally {
                    sendResponse({ status: 'completed' });
                }
            })();
            return true;
        }

        // --- IMAGE FETCHING (GENERATED DISPLAY) ---
        if (request.action === 'FETCH_GENERATED_IMAGE') {
            (async () => {
                try {
                    const result = await this.imageHandler.fetchImage(request.url);

                    const payload = {
                        action: 'GENERATED_IMAGE_RESULT',
                        tabId: this._getTargetSidePanelTabId(request, sender),
                        reqId: request.reqId,
                        base64: result.base64,
                        error: result.error,
                    };

                    this._sendToRequestSource(sender, payload);
                } catch (error) {
                    console.error('Fetch generated image error', error);
                    const payload = {
                        action: 'GENERATED_IMAGE_RESULT',
                        tabId: this._getTargetSidePanelTabId(request, sender),
                        reqId: request.reqId,
                        error: error.message,
                    };
                    this._sendToRequestSource(sender, payload);
                } finally {
                    sendResponse({ status: 'completed' });
                }
            })();
            return true;
        }

        // --- SIDEPANEL & SELECTION ---

        if (request.action === 'OPEN_SIDE_PANEL') {
            this._handleOpenSidePanel(request, sender).finally(() => {
                sendResponse({ status: 'opened' });
            });
            return true;
        }

        if (request.action === 'TOGGLE_SIDE_PANEL_CONTROL') {
            this._handleToggleSidePanelControl(request, sender).finally(() => {
                sendResponse({ status: 'processed' });
            });
            return true;
        }

        if (request.action === 'INITIATE_CAPTURE') {
            (async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (tab) {
                    // Pre-capture for the overlay background
                    // Pass windowId explicitly to capture the correct window
                    const capture = await this.imageHandler.captureScreenshot(tab.windowId);
                    chrome.tabs
                        .sendMessage(tab.id, {
                            action: 'START_SELECTION',
                            image: capture.base64,
                            mode: request.mode, // Forward the mode (ocr, snip, translate)
                            source: request.source, // Forward the source (sidepanel or local)
                            targetSidePanelTabId: this._getTargetSidePanelTabId(request, sender),
                        })
                        .catch(() => {});
                }
            })();
            return false;
        }

        if (request.action === 'AREA_SELECTED') {
            (async () => {
                try {
                    // Use windowId from sender tab to ensure we capture the same window where selection occurred
                    const windowId = sender.tab ? sender.tab.windowId : null;
                    const result = await this.imageHandler.captureArea(request.area, windowId);
                    if (result && sender.tab) {
                        // Send specifically to the tab that initiated the selection
                        chrome.tabs.sendMessage(sender.tab.id, result).catch(() => {});
                    }
                } catch (error) {
                    console.error('Area capture error', error);
                } finally {
                    sendResponse({ status: 'completed' });
                }
            })();
            return true;
        }

        if (request.action === 'PROCESS_CROP_IN_SIDEPANEL') {
            // Broadcast the crop result to runtime so Side Panel can pick it up
            chrome.runtime
                .sendMessage({
                    ...request.payload,
                    tabId: request.payload?.tabId || this._getTargetSidePanelTabId(request, sender),
                })
                .catch(() => {});
            sendResponse({ status: 'forwarded' });
            return true;
        }

        if (request.action === 'GET_ACTIVE_SELECTION') {
            (async () => {
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (tab) {
                    try {
                        const response = await chrome.tabs.sendMessage(tab.id, {
                            action: 'GET_SELECTION',
                        });
                        chrome.runtime
                            .sendMessage({
                                action: 'SELECTION_RESULT',
                                tabId: this._getTargetSidePanelTabId(request, sender),
                                text: response ? response.selection : '',
                            })
                            .catch(() => {});
                    } catch {
                        chrome.runtime
                            .sendMessage({
                                action: 'SELECTION_RESULT',
                                tabId: this._getTargetSidePanelTabId(request, sender),
                                text: '',
                            })
                            .catch(() => {});
                    }
                }
                sendResponse({ status: 'completed' });
            })();
            return true;
        }

        // --- PAGE CONTEXT CHECK ---
        if (request.action === 'CHECK_PAGE_CONTEXT') {
            (async () => {
                const content = await getActiveTabContent();
                const length = content ? content.length : 0;
                sendResponse({ action: 'PAGE_CONTEXT_RESULT', length: length });
            })();
            return true;
        }

        // --- MCP (External Tools) ---
        if (request.action === 'MCP_TEST_CONNECTION') {
            (async () => {
                try {
                    const { tools, transport, url } = await this._loadMcpTools(request, '_test_');

                    sendResponse({
                        action: 'MCP_TEST_RESULT',
                        ok: true,
                        serverId: request.serverId || null,
                        transport,
                        url,
                        toolsCount: Array.isArray(tools) ? tools.length : 0,
                    });
                } catch (error) {
                    sendResponse({
                        action: 'MCP_TEST_RESULT',
                        ok: false,
                        serverId: request.serverId || null,
                        transport: request.transport || 'sse',
                        url: request.url || '',
                        error: error.message || String(error),
                    });
                }
            })();
            return true;
        }

        if (request.action === 'MCP_LIST_TOOLS') {
            (async () => {
                try {
                    const { tools, transport, url } = await this._loadMcpTools(request, '_tools_');

                    sendResponse({
                        action: 'MCP_TOOLS_RESULT',
                        ok: true,
                        serverId: request.serverId || null,
                        requestKey: request.requestKey || null,
                        transport,
                        url,
                        tools: this._toSafeMcpTools(tools),
                    });
                } catch (error) {
                    sendResponse({
                        action: 'MCP_TOOLS_RESULT',
                        ok: false,
                        serverId: request.serverId || null,
                        requestKey: request.requestKey || null,
                        transport: request.transport || 'sse',
                        url: request.url || '',
                        error: error.message || String(error),
                        tools: [],
                    });
                }
            })();
            return true;
        }

        // --- TAB MANAGEMENT ---

        if (request.action === 'GET_OPEN_TABS') {
            (async () => {
                const tabQuery = { currentWindow: true };
                const groupId = this.controlManager?.getControlledGroupId?.();
                const windowId = this.controlManager?.getControlledWindowId?.();
                if (Number.isInteger(windowId) && windowId > 0) {
                    delete tabQuery.currentWindow;
                    tabQuery.windowId = windowId;
                }
                if (Number.isInteger(groupId) && groupId >= 0) {
                    tabQuery.groupId = groupId;
                }
                const tabs = await chrome.tabs.query(tabQuery);
                const safeTabs = tabs.map((tab) => toControlTabSummary(tab));

                // Get the currently locked tab ID to inform UI state
                const lockedTabId = this.controlManager
                    ? this.controlManager.getTargetTabId()
                    : null;

                chrome.runtime
                    .sendMessage({
                        action: 'OPEN_TABS_RESULT',
                        tabId: this._getTargetSidePanelTabId(request, sender),
                        tabs: safeTabs,
                        lockedTabId: lockedTabId,
                    })
                    .catch(() => {});
                sendResponse({ status: 'completed' });
            })();
            return true;
        }

        if (request.action === 'SWITCH_TAB') {
            (async () => {
                const tabId = request.tabId || null;
                if (
                    tabId &&
                    this.controlManager?.isTabControllable &&
                    !(await this.controlManager.isTabControllable(tabId))
                ) {
                    sendResponse({ status: 'error', error: 'Tab cannot be controlled.' });
                    return;
                }

                // tabId can be null to unlock
                if (this.controlManager) {
                    this.controlManager.setOwnerSidePanelTabId?.(
                        this._getTargetSidePanelTabId(request, sender)
                    );
                    this.controlManager.setTargetTab(tabId);
                }
                // Only switch visual tab if a specific ID is provided AND switchVisual is not explicitly false
                if (tabId && request.switchVisual !== false) {
                    chrome.tabs.update(tabId, { active: true }).catch((err) => console.warn(err));
                }
                sendResponse({ status: 'switched' });
            })();
            return true;
        }

        // --- BROWSER CONTROL TOGGLE ---
        if (request.action === 'TOGGLE_BROWSER_CONTROL') {
            if (this.controlManager) {
                this.controlManager.setOwnerSidePanelTabId?.(
                    this._getTargetSidePanelTabId(request, sender)
                );
                if (request.enabled) {
                    this.controlManager.enableControl();
                } else {
                    this.controlManager.disableControl();
                }
            }
            sendResponse({ status: 'processed' });
            return true;
        }

        return false;
    }

    _sendToRequestSource(sender, payload) {
        if (sender.tab) {
            chrome.tabs.sendMessage(sender.tab.id, payload).catch(() => {});
            return;
        }

        chrome.runtime.sendMessage(payload).catch(() => {});
    }

    async _loadMcpTools(request, fallbackServerId) {
        if (!this.mcpManager) throw new Error('MCP manager not available');

        const url = (request.url || '').trim();
        const transport = (request.transport || 'sse').toLowerCase();
        if (!url) throw new Error('Server URL is empty');

        const tools = await this.mcpManager.listTools({
            enableMcpTools: true,
            mcpTransport: transport,
            mcpServerUrl: url,
            mcpServerId: request.serverId || fallbackServerId,
            mcpHeaders: request.headers,
        });

        return { tools, transport, url };
    }

    _toSafeMcpTools(tools) {
        return Array.isArray(tools)
            ? tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description || '',
              }))
            : [];
    }

    async _handleOpenSidePanel(request, sender) {
        if (sender.tab) {
            let openPromise;
            try {
                if (this.sidePanelScopeManager) {
                    openPromise = this.sidePanelScopeManager.openForTab(
                        sender.tab.id,
                        sender.tab.windowId
                    );
                } else {
                    chrome.sidePanel
                        .setOptions({
                            tabId: sender.tab.id,
                            enabled: true,
                            path: getPanelPathForTab(sender.tab.id),
                        })
                        .catch(() => {});
                    openPromise = chrome.sidePanel.open({
                        tabId: sender.tab.id,
                        windowId: sender.tab.windowId,
                    });
                }
            } catch (error) {
                console.error('Could not start side panel open flow:', error);
                openPromise = Promise.reject(error);
            }

            const updateOps = {};
            if (request.sessionId) updateOps.pendingSessionId = request.sessionId;
            if (request.mode) updateOps.pendingMode = request.mode;

            if (Object.keys(updateOps).length > 0) {
                await chrome.storage.local.set(updateOps);
                // Clear pending items after a timeout to prevent stale actions
                setTimeout(() => {
                    const keys = Object.keys(updateOps);
                    chrome.storage.local.remove(keys);
                }, 5000);
            }

            try {
                await openPromise;
            } catch (error) {
                console.error('Could not open side panel:', error);
            }

            // If immediate execution needed after open (panel might already be open)
            setTimeout(() => {
                if (request.sessionId) {
                    chrome.runtime
                        .sendMessage({
                            action: 'SWITCH_SESSION',
                            tabId: sender.tab.id,
                            sessionId: request.sessionId,
                        })
                        .catch(() => {});
                }
                if (request.mode === 'browser_control') {
                    chrome.runtime
                        .sendMessage({
                            action: 'ACTIVATE_BROWSER_CONTROL',
                            tabId: sender.tab.id,
                        })
                        .catch(() => {});
                }
            }, 500);
        }
    }

    async _handleToggleSidePanelControl(request, sender) {
        if (!sender.tab) return;

        const tabId = sender.tab.id;
        const currentLock = this.controlManager ? this.controlManager.getTargetTabId() : null;

        // Is Browser Control active for this tab?
        const isControlActive = currentLock === tabId;

        if (isControlActive) {
            if (this.controlManager) {
                await this.controlManager.disableControl();
            }

            try {
                // This effectively closes the side panel for this tab
                await chrome.sidePanel.setOptions({ tabId, enabled: false });

                // Re-enable it quickly so it can be opened again later
                setTimeout(() => {
                    chrome.sidePanel.setOptions({
                        tabId,
                        enabled: true,
                        path: getPanelPathForTab(tabId),
                    });
                }, 250);
            } catch (error) {
                console.error('Failed to toggle side panel close:', error);
            }
        } else {
            if (this.controlManager) {
                this.controlManager.setOwnerSidePanelTabId(
                    this._getTargetSidePanelTabId(request, sender)
                );
            }
            await this._handleOpenSidePanel({ ...request, mode: 'browser_control' }, sender);
        }
    }

    _getTargetSidePanelTabId(request, sender) {
        if (Number.isInteger(request?.sidePanelTabId) && request.sidePanelTabId > 0) {
            return request.sidePanelTabId;
        }
        if (Number.isInteger(sender?.tab?.id) && sender.tab.id > 0) {
            return sender.tab.id;
        }
        return null;
    }
}
