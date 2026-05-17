import { ConnectionSection } from './sections/connection.js';
import { GeneralSection } from './sections/general.js';
import { AppearanceSection } from './sections/appearance.js';
import { ShortcutsSection } from './sections/shortcuts.js';
import { AboutSection } from './sections/about.js';

export class SettingsView {
    constructor(callbacks) {
        this.callbacks = callbacks || {};
        this.elements = {};

        this.connection = new ConnectionSection();

        this.general = new GeneralSection({
            onTextSelectionChange: (value) => this.fire('onTextSelectionChange', value),
            onImageToolsChange: (value) => this.fire('onImageToolsChange', value),
            onSidebarBehaviorChange: (value) => this.fire('onSidebarBehaviorChange', value),
            onSidePanelScopeChange: (value) => this.fire('onSidePanelScopeChange', value),
        });

        this.appearance = new AppearanceSection({
            onThemeChange: (value) => this.fire('onThemeChange', value),
            onLanguageChange: (value) => this.fire('onLanguageChange', value),
        });

        this.shortcuts = new ShortcutsSection();

        this.about = new AboutSection({
            onDownloadLogs: () => this.fire('onDownloadLogs'),
        });

        this.queryElements();
        this.bindEvents();
    }

    queryElements() {
        const get = (id) => document.getElementById(id);

        this.elements = {
            modal: get('settings-modal'),
            btnClose: get('close-settings'),
            btnSave: get('save-shortcuts'),
            btnReset: get('reset-shortcuts'),
        };
    }

    bindEvents() {
        const { modal, btnClose, btnSave, btnReset } = this.elements;

        if (btnClose) btnClose.addEventListener('click', () => this.close());
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }

        if (btnSave) btnSave.addEventListener('click', () => this.handleSave());
        if (btnReset) btnReset.addEventListener('click', () => this.handleReset());

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.classList.contains('visible')) {
                this.close();
            }
        });
    }

    handleSave() {
        const shortcutsData = this.shortcuts.getData();
        const connectionData = this.connection.getData();
        const generalData = this.general.getData();

        const data = {
            shortcuts: shortcutsData,
            connection: connectionData,
            textSelection: generalData.textSelection,
            imageTools: generalData.imageTools,
            accountIndices: generalData.accountIndices,
            sidebarBehavior: generalData.sidebarBehavior,
            sidePanelScope: generalData.sidePanelScope,
            contextMode: generalData.contextMode,
            contextRecentTurns: generalData.contextRecentTurns,
        };

        this.fire('onSave', data);
        this.close();
    }

    handleReset() {
        this.fire('onReset');
    }

    open() {
        if (this.elements.modal) {
            this.elements.modal.classList.add('visible');
            this.fire('onOpen');
        }
    }

    close() {
        if (this.elements.modal) {
            this.elements.modal.classList.remove('visible');
        }
    }

    // Delegation to Shortcuts
    setShortcuts(shortcuts) {
        this.shortcuts.setData(shortcuts);
    }

    // Delegation to Appearance
    setThemeValue(theme) {
        this.appearance.setTheme(theme);
    }

    setLanguageValue(lang) {
        this.appearance.setLanguage(lang);
    }

    applyVisualTheme(theme) {
        this.appearance.applyVisualTheme(theme);
    }

    // Delegation to General
    setToggles(textSelection, imageTools) {
        this.general.setToggles(textSelection, imageTools);
    }

    setSidebarBehavior(behavior) {
        this.general.setSidebarBehavior(behavior);
    }

    setAccountIndices(value) {
        this.general.setAccountIndices(value);
    }

    setSidePanelScope(scope) {
        this.general.setSidePanelScope(scope);
    }

    setContextSettings(settings) {
        this.general.setContextSettings(settings);
    }

    // Delegation to Connection
    setConnectionSettings(data) {
        this.connection.setData(data);
    }

    // Delegation to About
    displayStars(count) {
        this.about.displayStars(count);
    }

    hasFetchedStars() {
        return this.about.hasFetchedStars();
    }

    getCurrentVersion() {
        return this.about.getCurrentVersion();
    }

    displayUpdateStatus(latest, current, isUpdateAvailable) {
        this.about.displayUpdateStatus(latest, current, isUpdateAvailable);
    }

    setAppVersion(version) {
        this.about.setCurrentVersion(version);
    }

    fire(event, data) {
        if (this.callbacks[event]) this.callbacks[event](data);
    }
}
