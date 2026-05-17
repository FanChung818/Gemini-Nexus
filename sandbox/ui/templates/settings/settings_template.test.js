// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { GeneralSettingsTemplate } from './general.js';
import { ConnectionSettingsTemplate } from './connection.js';
import { ShortcutsSettingsTemplate } from './shortcuts.js';

describe('settings templates', () => {
    it('moves explanatory copy into compact help buttons', () => {
        document.body.innerHTML =
            GeneralSettingsTemplate + ConnectionSettingsTemplate + ShortcutsSettingsTemplate;

        expect(document.querySelectorAll('.setting-desc')).toHaveLength(0);
        expect(document.querySelectorAll('.setting-radio-desc')).toHaveLength(0);

        const helpButtons = [...document.querySelectorAll('.setting-help')];
        const helpKeys = helpButtons.map((button) => button.getAttribute('data-i18n-title'));

        expect(helpKeys).toEqual(
            expect.arrayContaining([
                'textSelectionDesc',
                'imageToolsToggleDesc',
                'accountIndicesDesc',
                'contextModeDesc',
                'contextRecentTurnsDesc',
                'sidebarBehaviorAutoDesc',
                'mcpToolsDesc',
                'mcpHeadersDesc',
                'shortcutDesc',
            ])
        );
        expect(helpButtons.every((button) => button.type === 'button')).toBe(true);
        expect(helpButtons.every((button) => button.getAttribute('aria-label') === 'Help')).toBe(
            true
        );
    });

    it('uses hidden attributes instead of inline display styles for collapsed panels', () => {
        document.body.innerHTML = ConnectionSettingsTemplate;

        const collapsedPanels = [
            'api-key-container',
            'official-fields',
            'openai-fields',
            'mcp-fields',
        ].map((id) => document.getElementById(id));

        expect(collapsedPanels.every((panel) => panel.hidden)).toBe(true);
        expect(document.querySelectorAll('[style*="display: none"]').length).toBe(0);
    });

    it('presents Streamable HTTP as the standard transport and labels WebSocket as custom', () => {
        document.body.innerHTML = ConnectionSettingsTemplate;

        const options = [...document.querySelectorAll('#mcp-transport option')].map((option) => ({
            value: option.value,
            text: option.textContent,
        }));

        expect(options[0]).toEqual({
            value: 'streamable-http',
            text: 'Streamable HTTP (official, http://.../mcp)',
        });
        expect(options).toContainEqual({
            value: 'ws',
            text: 'Custom WebSocket (non-standard, ws://)',
        });
        expect(document.getElementById('mcp-server-url').placeholder).toBe(
            'http://127.0.0.1:3006/mcp'
        );
    });
});
