import {
    DEFAULT_CONTEXT_MODE,
    DEFAULT_CONTEXT_RECENT_TURNS,
    DEFAULT_SIDE_PANEL_SCOPE,
} from '../../shared/config/constants.js';
import {
    CONNECTION_STORAGE_KEYS,
    createConnectionSettingsPayload,
} from '../../shared/settings/connection.js';

export function getOwnerTabIdFromLocation(locationLike = window.location) {
    try {
        const url = new URL(locationLike.href);
        const tabId = Number.parseInt(url.searchParams.get('tabId'), 10);
        return Number.isInteger(tabId) && tabId > 0 ? tabId : null;
    } catch {
        return null;
    }
}

export class StateManager {
    constructor(frameManager) {
        this.frame = frameManager;
        this.data = null; // Pre-fetched data cache
        this.sessionData = null;
        this.ownerTabId = getOwnerTabIdFromLocation();
        this.currentTabId = this.ownerTabId ?? undefined;
        this.uiIsReady = false;
        this.hasInitialized = false;
    }

    init() {
        // Start fetching bulk data immediately
        chrome.storage.local.get(
            [
                'geminiSessions',
                'pendingSessionId',
                'pendingMode', // Fetch pending mode (e.g. browser_control)
                'geminiShortcuts',
                'pendingImage',
                'geminiSidebarBehavior',
                'geminiSidePanelScope',
                'geminiTextSelectionEnabled',
                'geminiImageToolsEnabled',
                'geminiAccountIndices',
                ...CONNECTION_STORAGE_KEYS,
                'geminiContextMode',
                'geminiContextRecentTurns',
            ],
            (result) => {
                this.data = result;
                this.trySendInitData();
            }
        );

        chrome.storage.session.get(['geminiSidePanelSessionBindings'], (result) => {
            this.sessionData = result;
            this.trySendInitData();
        });

        if (this.hasFixedTabContext()) {
            this.trySendInitData();
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                this.currentTabId = tabs && tabs[0] ? tabs[0].id : null;
                this.trySendInitData();
            });
        }

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'session' || !changes.geminiSidePanelSessionBindings) return;

            this.sessionData = {
                geminiSidePanelSessionBindings:
                    changes.geminiSidePanelSessionBindings.newValue || {},
            };
            this.postCurrentTabContext();
        });

        chrome.tabs.onActivated.addListener(({ tabId }) => {
            if (this.hasFixedTabContext()) return;

            this.currentTabId = tabId || null;
            this.postCurrentTabContext();
        });

        chrome.tabs.onRemoved.addListener((tabId) => {
            this.removeSessionBinding(tabId);

            if (this.ownerTabId === tabId) {
                this.currentTabId = null;
                this.postCurrentTabContext();
                return;
            }

            if (this.hasFixedTabContext()) return;

            if (this.currentTabId === tabId) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    this.currentTabId = tabs && tabs[0] ? tabs[0].id : null;
                    this.postCurrentTabContext();
                });
            }
        });

        // Safety Timeout: Force reveal if handshake fails
        setTimeout(() => {
            if (!this.uiIsReady) {
                console.warn('UI_READY signal timeout, forcing skeleton removal');
                this.frame.reveal();
            }
        }, 1000);
    }

    markUiReady() {
        this.uiIsReady = true;
        this.trySendInitData();
    }

    trySendInitData() {
        // Only proceed if we have data AND the UI has signaled readiness
        // (Or if we can detect the window exists, though UI_READY is safer for logic)
        if (
            (!this.uiIsReady && !this.hasInitialized) ||
            !this.data ||
            this.sessionData === null ||
            this.currentTabId === undefined
        )
            return;

        this.hasInitialized = true;
        this.frame.reveal();

        const frameWindow = this.frame.getWindow();
        if (!frameWindow) return;

        const connectionSettings = createConnectionSettingsPayload(this.data);
        const provider = connectionSettings.provider;
        const selectedModel = connectionSettings.selectedModel;

        // Restore settings first so the model list is ready before model selection.
        this.frame.postMessage({
            action: 'RESTORE_CONNECTION_SETTINGS',
            payload: connectionSettings,
        });

        this.frame.postMessage({
            action: 'RESTORE_SIDEBAR_BEHAVIOR',
            payload: this.data.geminiSidebarBehavior || 'auto',
        });
        this.frame.postMessage({
            action: 'RESTORE_CONTEXT_SETTINGS',
            payload: {
                mode: this.data.geminiContextMode || DEFAULT_CONTEXT_MODE,
                recentTurns: this.data.geminiContextRecentTurns || DEFAULT_CONTEXT_RECENT_TURNS,
            },
        });
        this.frame.postMessage({
            action: 'RESTORE_SIDE_PANEL_SCOPE',
            payload: this.data.geminiSidePanelScope || DEFAULT_SIDE_PANEL_SCOPE,
        });
        this.postCurrentTabContext();
        this.frame.postMessage({
            action: 'RESTORE_SESSIONS',
            payload: this.data.geminiSessions || [],
        });
        this.frame.postMessage({
            action: 'RESTORE_SHORTCUTS',
            payload: this.data.geminiShortcuts || null,
        });

        this.frame.postMessage({ action: 'RESTORE_MODEL', payload: selectedModel });

        this.frame.postMessage({
            action: 'RESTORE_TEXT_SELECTION',
            payload: this.data.geminiTextSelectionEnabled !== false,
        });
        this.frame.postMessage({
            action: 'RESTORE_IMAGE_TOOLS',
            payload: this.data.geminiImageToolsEnabled !== false,
        });
        this.frame.postMessage({
            action: 'RESTORE_ACCOUNT_INDICES',
            payload: this.data.geminiAccountIndices || '0',
        });
        this.frame.postMessage({
            action: 'RESTORE_APP_VERSION',
            payload: `v${chrome.runtime.getManifest().version}`,
        });

        // Replay deferred actions captured before the side panel was ready.
        if (this.data.pendingSessionId) {
            this.frame.postMessage({
                action: 'BACKGROUND_MESSAGE',
                payload: { action: 'SWITCH_SESSION', sessionId: this.data.pendingSessionId },
            });
            chrome.storage.local.remove('pendingSessionId');
            delete this.data.pendingSessionId;
        }

        if (this.data.pendingImage) {
            this.frame.postMessage({
                action: 'BACKGROUND_MESSAGE',
                payload: this.data.pendingImage,
            });
            chrome.storage.local.remove('pendingImage');
            delete this.data.pendingImage;
        }

        if (this.data.pendingMode === 'browser_control') {
            this.frame.postMessage({
                action: 'BACKGROUND_MESSAGE',
                payload: { action: 'ACTIVATE_BROWSER_CONTROL' },
            });
            chrome.storage.local.remove('pendingMode');
            delete this.data.pendingMode;
        }

        // Theme and language are mirrored in localStorage for early paint.
        const cachedTheme = localStorage.getItem('geminiTheme') || 'system';
        const cachedLang = localStorage.getItem('geminiLanguage') || 'system';

        this.frame.postMessage({ action: 'RESTORE_LANGUAGE', payload: cachedLang });
        this.frame.postMessage({ action: 'RESTORE_THEME', payload: cachedTheme });
    }

    updateSessions(sessions) {
        if (this.data) this.data.geminiSessions = sessions;
        // Note: No need to save to storage here, usually comes from background broadcast
    }

    save(key, value) {
        if (this.data) this.data[key] = value;

        const update = {};
        update[key] = value;
        chrome.storage.local.set(update);

        if (key === 'geminiTheme') localStorage.setItem('geminiTheme', value);
        if (key === 'geminiLanguage') localStorage.setItem('geminiLanguage', value);
    }

    getCurrentTabId() {
        return this.currentTabId;
    }

    hasFixedTabContext() {
        return Number.isInteger(this.ownerTabId) && this.ownerTabId > 0;
    }

    getSessionBindings() {
        return this.sessionData?.geminiSidePanelSessionBindings || {};
    }

    postCurrentTabContext() {
        if (!this.hasInitialized) return;
        if (!this.frame.getWindow()) return;

        const sessionBindings = this.getSessionBindings();
        const boundSessionId = this.currentTabId
            ? sessionBindings[this.currentTabId] || null
            : null;

        this.frame.postMessage({
            action: 'RESTORE_SIDE_PANEL_TAB_CONTEXT',
            payload: {
                tabId: this.currentTabId,
                sessionId: boundSessionId,
            },
        });
    }

    removeSessionBinding(tabId) {
        if (!Number.isInteger(tabId) || tabId <= 0) return;

        const sessionBindings = this.getSessionBindings();
        if (!Object.prototype.hasOwnProperty.call(sessionBindings, tabId)) return;

        const nextBindings = { ...sessionBindings };
        delete nextBindings[tabId];
        this.sessionData = { geminiSidePanelSessionBindings: nextBindings };
        chrome.storage.session.set({ geminiSidePanelSessionBindings: nextBindings });
    }
}
