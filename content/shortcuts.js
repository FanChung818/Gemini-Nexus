(function () {
    window.GeminiShortcuts?.destroy?.();
    if (window.GeminiNexusPageGuard?.isDisabled) {
        delete window.GeminiShortcuts;
        return;
    }

    const DEFAULT_SHORTCUTS = {
        quickAsk: 'Ctrl+G',
        openPanel: 'Alt+S',
        browserControl: 'Ctrl+B',
        ocrCapture: 'Alt+O',
    };
    const MODIFIER_KEYS = ['ctrl', 'alt', 'shift', 'meta', 'command'];

    function normalizeShortcuts(shortcuts) {
        const stored =
            shortcuts && typeof shortcuts === 'object' && !Array.isArray(shortcuts)
                ? shortcuts
                : {};
        return { ...DEFAULT_SHORTCUTS, ...stored };
    }

    function getStorageReadError() {
        return chrome.runtime?.lastError?.message || null;
    }

    function isEditableShortcutTarget(target) {
        if (!(target instanceof Element)) return false;
        if (target.closest('[contenteditable=""], [contenteditable="true"]')) return true;
        const tagName = target.tagName.toLowerCase();
        return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    }

    class ShortcutManager {
        constructor() {
            this.appShortcuts = {};
            this.toolbarController = null;
            this.handleStorageChange = this.handleStorageChange.bind(this);
            this.handleDocumentKeydown = (event) => this.handleKeydown(event);
            this.init();
        }

        setController(controller) {
            this.toolbarController = controller;
        }

        init() {
            chrome.storage.local.get(['geminiShortcuts'], (result) => {
                const errorMessage = getStorageReadError();
                if (errorMessage) {
                    console.warn('Failed to load Gemini Nexus shortcuts:', errorMessage);
                    return;
                }

                this.appShortcuts = normalizeShortcuts(result?.geminiShortcuts);
            });

            chrome.storage.onChanged.addListener(this.handleStorageChange);

            document.addEventListener('keydown', this.handleDocumentKeydown, true);
        }

        handleStorageChange(changes, area) {
            if (area === 'local' && changes.geminiShortcuts) {
                this.appShortcuts = normalizeShortcuts(changes.geminiShortcuts.newValue);
            }
        }

        destroy() {
            document.removeEventListener('keydown', this.handleDocumentKeydown, true);
            chrome.storage?.onChanged?.removeListener?.(this.handleStorageChange);
            this.toolbarController = null;
        }

        handleKeydown(event) {
            if (isEditableShortcutTarget(event.target)) return;

            if (this.match(event, this.appShortcuts.openPanel)) {
                event.preventDefault();
                event.stopPropagation();
                Promise.resolve(chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' }))
                    .then((response) => {
                        if (response?.status === 'error') {
                            this.toolbarController?.showExtensionError?.(
                                response.error || 'Could not open side panel'
                            );
                        }
                    })
                    .catch((error) => {
                        this.toolbarController?.showExtensionError?.(
                            error?.message || 'Could not open side panel'
                        );
                    });
                return;
            }

            if (this.match(event, this.appShortcuts.quickAsk)) {
                event.preventDefault();
                event.stopPropagation();
                if (this.toolbarController) {
                    this.toolbarController.showGlobalInput();
                }
                return;
            }

            if (this.match(event, this.appShortcuts.browserControl)) {
                event.preventDefault();
                event.stopPropagation();
                chrome.runtime.sendMessage({ action: 'TOGGLE_SIDE_PANEL_CONTROL' });
                return;
            }

            if (this.match(event, this.appShortcuts.ocrCapture)) {
                event.preventDefault();
                event.stopPropagation();
                chrome.runtime.sendMessage({
                    action: 'INITIATE_CAPTURE',
                    mode: 'ocr',
                    source: 'local',
                });
                return;
            }
        }

        match(event, shortcutString) {
            if (!shortcutString || typeof shortcutString !== 'string') return false;
            if (!event || typeof event.key !== 'string') return false;

            const parts = shortcutString.split('+').map((part) => part.trim().toLowerCase());
            const key = event.key.toLowerCase();

            const hasCtrl = parts.includes('ctrl');
            const hasAlt = parts.includes('alt');
            const hasShift = parts.includes('shift');
            const hasMeta = parts.includes('meta') || parts.includes('command');

            if (event.ctrlKey !== hasCtrl) return false;
            if (event.altKey !== hasAlt) return false;
            if (event.shiftKey !== hasShift) return false;
            if (event.metaKey !== hasMeta) return false;

            const mainKeys = parts.filter((part) => !MODIFIER_KEYS.includes(part));
            if (mainKeys.length !== 1) return false;

            return key === mainKeys[0];
        }
    }

    window.GeminiShortcuts = new ShortcutManager();
})();
