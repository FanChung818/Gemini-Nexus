// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabSelectorTemplate } from './templates/tab_selector.js';
import { HeaderTemplate } from './templates/header.js';
import { TemplateIcons } from './templates/icons.js';
import { TabSelectorController } from './tab_selector.js';

vi.mock('../core/i18n.js', () => ({
    t: (key) =>
        ({
            browserControlReady: 'Ready',
            browserControlDebugging: 'Debugging',
            browserControlNoTab: 'Choose a tab to control',
            browserControlUnavailable: 'Unavailable',
            browserControlUnavailableReason: 'Cannot control this page',
            controlThisTab: 'Control this tab',
            controlTabInBackground: 'Control without switching',
            currentTab: 'Current',
            selectTabTooltip: 'Select a tab to control',
            noTabsFound: 'No open tabs found.',
        })[key] || key,
}));

describe('TabSelectorController browser control bar', () => {
    beforeEach(() => {
        document.body.innerHTML = HeaderTemplate + TabSelectorTemplate;
    });

    it('keeps the legacy tab switcher hidden without inline display styles', () => {
        const trigger = document.getElementById('tab-switcher-btn');

        expect(trigger.hidden).toBe(true);
        expect(trigger.hasAttribute('style')).toBe(false);
    });

    it('shows the controlled tab state in the persistent control bar', () => {
        const controller = new TabSelectorController();

        controller.setControlVisible(true);
        controller.updateControlState({
            tab: {
                id: 7,
                title: 'OpenAI News | OpenAI',
                url: 'https://openai.com/news/',
                favIconUrl: 'https://openai.com/favicon.ico',
                controllable: true,
            },
            attached: true,
        });

        expect(document.getElementById('browser-control-bar').hidden).toBe(false);
        expect(document.getElementById('browser-control-title').textContent).toBe(
            'OpenAI News | OpenAI'
        );
        expect(document.getElementById('browser-control-meta').textContent).toBe('openai.com');
        expect(document.getElementById('browser-control-status').textContent).toBe('Debugging');
        expect(
            document.getElementById('browser-control-bar').classList.contains('is-attached')
        ).toBe(true);
    });

    it('renders unavailable tabs disabled and keeps lock-only action separate', () => {
        const controller = new TabSelectorController();
        const onSelect = vi.fn();

        controller.open(
            [
                {
                    id: 1,
                    title: 'Extensions',
                    url: 'chrome://extensions/',
                    controllable: false,
                    reason: 'restricted',
                },
                {
                    id: 2,
                    title: 'OpenAI',
                    url: 'https://openai.com/',
                    controllable: true,
                    active: true,
                },
            ],
            onSelect,
            2
        );

        const disabledItem = document.querySelector('[data-tab-id="1"]');
        const activeItem = document.querySelector('[data-tab-id="2"]');
        expect(disabledItem.classList.contains('disabled')).toBe(true);
        disabledItem.click();
        expect(onSelect).not.toHaveBeenCalled();

        activeItem.querySelector('.tab-lock-only-btn').click();
        expect(onSelect).toHaveBeenCalledWith(2, false);
    });

    it('resets the trigger button with the shared tab stack icon', () => {
        const controller = new TabSelectorController();
        const trigger = document.getElementById('tab-switcher-btn');
        const expected = document.createElement('div');
        expected.innerHTML = TemplateIcons.TAB_STACK;

        controller.resetTrigger();

        expect(trigger.innerHTML).toBe(expected.innerHTML);
    });
});
