import { BaseActionHandler } from '../../base.js';
import { handleFillElement, handleFillForm } from './fill.js';
import { handlePressKey } from './press.js';
import { handleTypeText } from './type.js';

export class KeyboardActions extends BaseActionHandler {
    async fillElement(args) {
        return handleFillElement(this, args);
    }

    async fillForm(args) {
        return handleFillForm(this, args);
    }

    async pressKey(args) {
        return handlePressKey(this, args);
    }

    async typeText(args) {
        return handleTypeText(this, args);
    }
}
