export class ShortcutsSection {
    constructor() {
        this.elements = {};
        this.queryElements();
        this.bindEvents();
    }

    queryElements() {
        const get = (id) => document.getElementById(id);
        this.elements = {
            inputQuickAsk: get('shortcut-quick-ask'),
            inputOpenPanel: get('shortcut-open-panel'),
            inputBrowserControl: get('shortcut-browser-control'),
        };
    }

    bindEvents() {
        this.setupShortcutInput(this.elements.inputQuickAsk);
        this.setupShortcutInput(this.elements.inputOpenPanel);
        this.setupShortcutInput(this.elements.inputBrowserControl);
    }

    setupShortcutInput(inputEl) {
        if (!inputEl) return;
        inputEl.addEventListener('keydown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;

            const keys = [];
            if (event.ctrlKey) keys.push('Ctrl');
            if (event.altKey) keys.push('Alt');
            if (event.shiftKey) keys.push('Shift');
            if (event.metaKey) keys.push('Meta');

            let normalizedKey = event.key.toUpperCase();
            if (normalizedKey === ' ') normalizedKey = 'Space';
            keys.push(normalizedKey);

            inputEl.value = keys.join('+');
        });
    }

    setData(shortcuts) {
        if (this.elements.inputQuickAsk) this.elements.inputQuickAsk.value = shortcuts.quickAsk;
        if (this.elements.inputOpenPanel) this.elements.inputOpenPanel.value = shortcuts.openPanel;
        if (this.elements.inputBrowserControl)
            this.elements.inputBrowserControl.value = shortcuts.browserControl || 'Ctrl+B';
    }

    getData() {
        const { inputQuickAsk, inputOpenPanel, inputBrowserControl } = this.elements;
        return {
            quickAsk: inputQuickAsk ? inputQuickAsk.value : null,
            openPanel: inputOpenPanel ? inputOpenPanel.value : null,
            browserControl: inputBrowserControl ? inputBrowserControl.value : 'Ctrl+B',
        };
    }
}
