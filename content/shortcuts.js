(function () {
    const DEFAULT_SHORTCUTS = {
        quickAsk: 'Ctrl+G',
        openPanel: 'Alt+S',
        browserControl: 'Ctrl+B',
    };
    const MODIFIER_KEYS = ['ctrl', 'alt', 'shift', 'meta', 'command'];

    class ShortcutManager {
        constructor() {
            this.appShortcuts = { ...DEFAULT_SHORTCUTS };
            this.toolbarController = null;
            this.init();
        }

        setController(controller) {
            this.toolbarController = controller;
        }

        init() {
            chrome.storage.local.get(['geminiShortcuts'], (result) => {
                if (result.geminiShortcuts) {
                    this.appShortcuts = { ...this.appShortcuts, ...result.geminiShortcuts };
                }
            });

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.geminiShortcuts) {
                    this.appShortcuts = {
                        ...this.appShortcuts,
                        ...changes.geminiShortcuts.newValue,
                    };
                }
            });

            document.addEventListener('keydown', (event) => this.handleKeydown(event), true);
        }

        handleKeydown(event) {
            if (this.match(event, this.appShortcuts.openPanel)) {
                event.preventDefault();
                event.stopPropagation();
                chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
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
