import { BaseActionHandler } from '../base.js';
import { ScriptActions } from './script.js';
import { WaitActions } from './wait.js';
import { DialogActions } from './dialog.js';

export class ObservationActions extends BaseActionHandler {
    constructor(connection, snapshotManager, waitHelper) {
        super(connection, snapshotManager, waitHelper);

        this.script = new ScriptActions(connection, snapshotManager, waitHelper);
        this.wait = new WaitActions(connection, snapshotManager, waitHelper);
        this.dialog = new DialogActions(connection, snapshotManager, waitHelper);
    }

    // --- Delegates ---

    async waitFor(args) {
        return this.wait.waitFor(args);
    }

    async evaluateScript(args) {
        return this.script.evaluateScript(args);
    }

    async handleDialog(args) {
        return this.dialog.handleDialog(args);
    }
}
