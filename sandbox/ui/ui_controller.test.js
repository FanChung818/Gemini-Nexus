// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { UIController } from './ui_controller.js';

describe('UIController tab switcher visibility', () => {
    it('keeps the legacy switcher hidden with the hidden attribute', () => {
        const tabSwitcherBtn = document.createElement('button');
        const tabSelector = { setControlVisible: vi.fn() };
        const controller = Object.create(UIController.prototype);
        controller.tabSwitcherBtn = tabSwitcherBtn;
        controller.tabSelector = tabSelector;

        controller.toggleTabSwitcher(true);

        expect(tabSelector.setControlVisible).toHaveBeenCalledWith(true);
        expect(tabSwitcherBtn.hidden).toBe(true);
        expect(tabSwitcherBtn.style.display).toBe('');
    });
});
