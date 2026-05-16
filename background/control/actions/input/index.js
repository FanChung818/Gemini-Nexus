// background/control/actions/input/index.js
import { BaseActionHandler } from '../base.js';
import { MouseActions } from './mouse.js';
import { KeyboardActions } from './keyboard/index.js';
import { FileActions } from './file.js';

export class InputActions extends BaseActionHandler {
    constructor(connection, snapshotManager, waitHelper) {
        super(connection, snapshotManager, waitHelper);
        this.mouse = new MouseActions(connection, snapshotManager, waitHelper);
        this.keyboard = new KeyboardActions(connection, snapshotManager, waitHelper);
        this.file = new FileActions(connection, snapshotManager, waitHelper);
    }

    async clickElement(args) {
        return this.mouse.clickElement(args);
    }

    async fillElement(args) {
        return this.keyboard.fillElement(args);
    }

    async pressKey(args) {
        return this.keyboard.pressKey(args);
    }

    async attachFile(args) {
        return this.file.attachFile(args);
    }
}
