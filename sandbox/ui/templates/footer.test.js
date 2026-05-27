// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { FooterTemplate } from './footer.js';

describe('FooterTemplate', () => {
    it('renders an AMC-style composer shell with textarea above the action row', () => {
        document.body.innerHTML = FooterTemplate;

        const inputWrapper = document.querySelector('.input-wrapper');
        const textareaShell = inputWrapper.querySelector('.composer-textarea-shell');
        const actions = inputWrapper.querySelector('.composer-actions');
        const leftActions = actions.querySelector('.composer-actions-left');
        const rightActions = actions.querySelector('.composer-actions-right');

        expect(inputWrapper.querySelector('#image-preview')).not.toBeNull();
        expect(textareaShell.querySelector('#prompt')).not.toBeNull();
        expect(leftActions.querySelector('#upload-btn')).not.toBeNull();
        expect(leftActions.querySelector('.tools-container')).not.toBeNull();
        expect(leftActions.querySelector('#youtube-summary-btn')).toBeNull();
        expect(rightActions.querySelector('#send')).not.toBeNull();

        expect(inputWrapper.contains(document.querySelector('.tools-container'))).toBe(true);
        expect(document.querySelector('.input-row')).toBeNull();
        expect(
            textareaShell.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('marks webpage-context tools separately from standalone-supported tools', () => {
        document.body.innerHTML = FooterTemplate;

        [
            'page-context-btn',
            'quote-btn',
            'ocr-btn',
            'screenshot-translate-btn',
            'snip-btn',
        ].forEach((buttonId) => {
            expect(document.getElementById(buttonId).classList.contains('context-aware')).toBe(
                true
            );
        });

        ['browser-control-btn', 'screen-capture-btn'].forEach((buttonId) => {
            expect(document.getElementById(buttonId).classList.contains('context-aware')).toBe(
                false
            );
        });
    });
});
