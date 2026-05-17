import { debugLog } from '../../shared/logging/debug.js';

/**
 * Manages the connection to the Chrome Debugger API.
 */
export class BrowserConnection {
    constructor() {
        this.currentTabId = null;
        this.targetTabId = null; // Tracks the intended tab ID even if debugger is not attached
        this.attached = false;
        this.onDetachCallbacks = [];
        this.eventListeners = new Set();

        // Global listener for CDP events
        chrome.debugger.onEvent.addListener(this._handleEvent.bind(this));

        // Monitor external detachments (e.g. user closed tab or clicked "Cancel" on infobar)
        chrome.debugger.onDetach.addListener(this._onDebuggerDetached.bind(this));
    }

    _handleEvent(source, method, params) {
        if (this.attached && this.currentTabId === source.tabId) {
            this.eventListeners.forEach((callback) => callback(method, params));
        }
    }

    _onDebuggerDetached(source, reason) {
        // If the browser detached our current session, clean up state immediately
        if (this.currentTabId === source.tabId) {
            debugLog('[BrowserConnection] Debugger detached by browser:', reason);
            this._cleanupState();
        }
    }

    _cleanupState() {
        this.attached = false;
        this.currentTabId = null;
        this.onDetachCallbacks.forEach((cb) => cb());
    }

    addListener(callback) {
        this.eventListeners.add(callback);
    }

    removeListener(callback) {
        this.eventListeners.delete(callback);
    }

    onDetach(callback) {
        this.onDetachCallbacks.push(callback);
    }

    async attach(tabId) {
        this.targetTabId = tabId; // Always store the intended tab

        // If already attached to the same tab, just ensure domains are enabled
        if (this.attached && this.currentTabId === tabId) {
            return;
        }

        // If attached to a different tab, detach first
        if (this.attached && this.currentTabId !== tabId) {
            await this.detach();
        }

        return new Promise((resolve, reject) => {
            chrome.debugger.attach({ tabId }, '1.3', async () => {
                if (chrome.runtime.lastError) {
                    const msg = chrome.runtime.lastError.message;
                    // Suppress common expected errors for restricted targets to avoid log noise
                    if (
                        msg.includes('restricted URL') ||
                        msg.includes('Cannot access') ||
                        msg.includes('Attach to webui')
                    ) {
                        debugLog('[BrowserConnection] Attach skipped (restricted):', msg);
                    } else {
                        console.warn('[BrowserConnection] Attach failed:', msg);
                    }
                    // Resolve anyway to allow fallback actions (like navigation) to proceed without debugger
                    resolve();
                } else {
                    this.attached = true;
                    this.currentTabId = tabId;

                    try {
                        await this.sendCommand('Runtime.enable');
                        // Page domain is often enabled by actions, but good to have for lifecycle
                        await this.sendCommand('Page.enable');

                        // Enable auto-attach for OOPIFs (Out-Of-Process Iframes)
                        // This allows perceiving content in cross-origin frames like Stripe, Google Login, etc.
                        // flatten: true is essential for chrome.debugger handling
                        await this.sendCommand('Target.setAutoAttach', {
                            autoAttach: true,
                            waitForDebuggerOnStart: false,
                            flatten: true,
                        });
                    } catch (error) {
                        console.warn('Failed to enable collection domains:', error);
                    }

                    resolve();
                }
            });
        });
    }

    async detach() {
        if (!this.attached || !this.currentTabId) return;
        return new Promise((resolve) => {
            chrome.debugger.detach({ tabId: this.currentTabId }, () => {
                // IMPORTANT: Consume lastError to prevent "Unchecked runtime.lastError"
                // if the tab was already closed or detached externally.
                if (chrome.runtime.lastError) {
                    debugLog(
                        '[BrowserConnection] Detach ignored:',
                        chrome.runtime.lastError.message
                    );
                }

                this._cleanupState();
                resolve();
            });
        });
    }

    sendCommand(method, params = {}) {
        if (!this.currentTabId) throw new Error('No active debugger session');
        return new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId: this.currentTabId }, method, params, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
    }
}
