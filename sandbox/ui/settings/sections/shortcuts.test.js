// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { ShortcutsSettingsTemplate } from '../../templates/settings/shortcuts.js';
import { ShortcutsSection } from './shortcuts.js';

describe('ShortcutsSection', () => {
    beforeEach(() => {
        document.body.innerHTML = ShortcutsSettingsTemplate;
    });

    it('restores and saves the OCR capture shortcut', () => {
        const section = new ShortcutsSection();

        section.setData({
            quickAsk: 'Alt+Q',
            openPanel: 'Alt+G',
            browserControl: 'Ctrl+B',
            ocrCapture: 'Ctrl+Shift+O',
        });

        expect(document.getElementById('shortcut-ocr-capture').value).toBe('Ctrl+Shift+O');
        expect(section.getData()).toEqual({
            quickAsk: 'Alt+Q',
            openPanel: 'Alt+G',
            browserControl: 'Ctrl+B',
            ocrCapture: 'Ctrl+Shift+O',
        });
    });

    it('records option-modified letter shortcuts by physical key', () => {
        new ShortcutsSection();

        const input = document.getElementById('shortcut-quick-ask');
        input.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'œ',
                code: 'KeyQ',
                altKey: true,
                bubbles: true,
                cancelable: true,
            })
        );

        expect(input.value).toBe('Alt+Q');
    });
});
