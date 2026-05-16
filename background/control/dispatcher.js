// background/control/dispatcher.js

/**
 * Maps string tool names to executable actions.
 * Decouples logic from the main ControlManager.
 */
export class ToolDispatcher {
    static DEBUGGER_OPTIONAL_TOOL_NAMES = new Set([
        'navigate_page',
        'new_page',
        'close_page',
        'list_pages',
        'select_page',
    ]);

    static LOCAL_TOOL_NAMES = new Set([
        // Navigation
        'navigate_page',
        'new_page',
        'close_page',
        'list_pages',
        'select_page',

        // Interaction
        'click',
        'fill',
        'press_key',
        'attach_file',

        // Observation & Logic
        'take_snapshot',
        'evaluate_script',
    ]);

    static isLocalTool(name) {
        return ToolDispatcher.LOCAL_TOOL_NAMES.has(name);
    }

    static requiresDebugger(name) {
        return !ToolDispatcher.DEBUGGER_OPTIONAL_TOOL_NAMES.has(name);
    }

    constructor(actions, snapshotManager) {
        this.actions = actions;
        this.snapshotManager = snapshotManager;
    }

    async dispatch(name, args) {
        switch (name) {
            // Navigation
            case 'navigate_page':
                return this.actions.navigatePage(args);
            case 'new_page':
                return this.actions.newPage(args);
            case 'close_page':
                return this.actions.closePage(args);
            case 'list_pages':
                return this.actions.listPages();
            case 'select_page':
                return this.actions.selectPage(args);

            // Interaction
            case 'click':
                return this.actions.clickElement(args);
            case 'fill':
                return this.actions.fillElement(args);
            case 'press_key':
                return this.actions.pressKey(args);
            case 'attach_file':
                return this.actions.attachFile(args);

            // Observation & Logic
            case 'take_snapshot':
                return this.snapshotManager.takeSnapshot(args);
            case 'evaluate_script':
                return this.actions.evaluateScript(args);

            default:
                return `Error: Unknown tool '${name}'`;
        }
    }
}
