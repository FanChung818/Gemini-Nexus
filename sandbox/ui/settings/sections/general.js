import {
    DEFAULT_CONTEXT_MODE,
    DEFAULT_CONTEXT_RECENT_TURNS,
    DEFAULT_SIDE_PANEL_SCOPE,
} from '../../../../shared/config/constants.js';

export class GeneralSection {
    constructor(callbacks) {
        this.callbacks = callbacks || {};
        this.elements = {};
        this.queryElements();
        this.bindEvents();
    }

    queryElements() {
        const get = (id) => document.getElementById(id);
        this.elements = {
            textSelectionToggle: get('text-selection-toggle'),
            imageToolsToggle: get('image-tools-toggle'),
            accountIndicesInput: get('account-indices-input'),
            contextModeSelect: get('context-mode-select'),
            contextRecentTurnsInput: get('context-recent-turns-input'),
            sidebarRadios: document.querySelectorAll('input[name="sidebar-behavior"]'),
            sidePanelScopeRadios: document.querySelectorAll('input[name="sidepanel-scope"]'),
        };
    }

    bindEvents() {
        const { textSelectionToggle, imageToolsToggle, sidebarRadios, sidePanelScopeRadios } =
            this.elements;

        if (textSelectionToggle) {
            textSelectionToggle.addEventListener('change', (event) =>
                this.fire('onTextSelectionChange', event.target.checked)
            );
        }
        if (imageToolsToggle) {
            imageToolsToggle.addEventListener('change', (event) =>
                this.fire('onImageToolsChange', event.target.checked)
            );
        }
        if (sidebarRadios) {
            sidebarRadios.forEach((radio) => {
                radio.addEventListener('change', (event) => {
                    if (event.target.checked) {
                        this.fire('onSidebarBehaviorChange', event.target.value);
                    }
                });
            });
        }
        if (sidePanelScopeRadios) {
            sidePanelScopeRadios.forEach((radio) => {
                radio.addEventListener('change', (event) => {
                    if (event.target.checked) {
                        this.fire('onSidePanelScopeChange', event.target.value);
                    }
                });
            });
        }
    }

    setToggles(textSelection, imageTools) {
        if (this.elements.textSelectionToggle)
            this.elements.textSelectionToggle.checked = textSelection;
        if (this.elements.imageToolsToggle) this.elements.imageToolsToggle.checked = imageTools;
    }

    setAccountIndices(value) {
        if (this.elements.accountIndicesInput)
            this.elements.accountIndicesInput.value = value || '0';
    }

    setSidebarBehavior(behavior) {
        if (this.elements.sidebarRadios) {
            const selectedValue = behavior || 'auto';
            this.elements.sidebarRadios.forEach((radio) => {
                radio.checked = radio.value === selectedValue;
            });
        }
    }

    setSidePanelScope(scope) {
        if (this.elements.sidePanelScopeRadios) {
            const availableValues = new Set(
                Array.from(this.elements.sidePanelScopeRadios).map((radio) => radio.value)
            );
            const selectedValue = availableValues.has(scope) ? scope : DEFAULT_SIDE_PANEL_SCOPE;
            this.elements.sidePanelScopeRadios.forEach((radio) => {
                radio.checked = radio.value === selectedValue;
            });
        }
    }

    setContextSettings(settings) {
        const mode = settings?.mode === 'recent' ? 'recent' : DEFAULT_CONTEXT_MODE;
        const recentTurns = Number.parseInt(settings?.recentTurns, 10);

        if (this.elements.contextModeSelect) {
            this.elements.contextModeSelect.value = mode;
        }
        if (this.elements.contextRecentTurnsInput) {
            this.elements.contextRecentTurnsInput.value = Number.isFinite(recentTurns)
                ? recentTurns
                : DEFAULT_CONTEXT_RECENT_TURNS;
        }
    }

    getData() {
        const {
            textSelectionToggle,
            imageToolsToggle,
            accountIndicesInput,
            contextModeSelect,
            contextRecentTurnsInput,
            sidebarRadios,
            sidePanelScopeRadios,
        } = this.elements;
        const selectedSidebarBehavior =
            Array.from(sidebarRadios || []).find((radio) => radio.checked)?.value || 'auto';
        const selectedScope =
            Array.from(sidePanelScopeRadios || []).find((radio) => radio.checked)?.value ||
            DEFAULT_SIDE_PANEL_SCOPE;
        return {
            textSelection: textSelectionToggle ? textSelectionToggle.checked : true,
            imageTools: imageToolsToggle ? imageToolsToggle.checked : true,
            accountIndices: accountIndicesInput ? accountIndicesInput.value : '0',
            sidebarBehavior: selectedSidebarBehavior,
            sidePanelScope: selectedScope,
            contextMode: contextModeSelect ? contextModeSelect.value : DEFAULT_CONTEXT_MODE,
            contextRecentTurns: contextRecentTurnsInput
                ? contextRecentTurnsInput.value
                : DEFAULT_CONTEXT_RECENT_TURNS,
        };
    }

    fire(event, data) {
        if (this.callbacks[event]) this.callbacks[event](data);
    }
}
