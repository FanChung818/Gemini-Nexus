// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { ConnectionSection, createMcpServerId } from './connection.js';

function createConnectionSectionHarness() {
    const summary = document.createElement('div');
    const list = document.createElement('div');
    const search = document.createElement('input');
    const section = Object.create(ConnectionSection.prototype);

    section.elements = {
        mcpToolsSummary: summary,
        mcpToolList: list,
        mcpToolSearch: search,
    };
    section.mcpServers = [
        {
            id: 'srv-1',
            name: 'Local',
            transport: 'sse',
            url: 'http://127.0.0.1:3006/new-sse',
            headers: {},
            enabled: true,
            toolMode: 'selected',
            enabledTools: [],
        },
    ];
    section.mcpActiveServerId = 'srv-1';
    section.mcpToolsCache = new Map();
    section.mcpToolsUiState = new Map();

    return { list, section, summary };
}

describe('ConnectionSection MCP tool cache', () => {
    it('creates readable unique MCP server ids', () => {
        const id = createMcpServerId();

        expect(id).toMatch(/^srv_[0-9A-F-]{8,}$/);
        expect(createMcpServerId()).not.toBe(id);
    });

    it('does not show a stale tool-list response after the server URL changed', () => {
        const { list, section, summary } = createConnectionSectionHarness();

        section.setMcpToolsList('srv-1', 'sse', 'http://127.0.0.1:3006/old-sse', [
            { name: 'old.tool', description: 'From the old endpoint' },
        ]);

        expect(summary.textContent).toBe(
            'No tool list loaded. Click "Refresh Tools" to load tools, then select which to expose.'
        );
        expect(list.textContent).not.toContain('old.tool');
    });
});

describe('ConnectionSection provider visibility', () => {
    it('toggles provider panels with hidden attributes', () => {
        const section = Object.create(ConnectionSection.prototype);
        section.elements = {
            apiKeyContainer: document.createElement('div'),
            webFields: document.createElement('div'),
            officialFields: document.createElement('div'),
            openaiFields: document.createElement('div'),
        };

        section.updateVisibility('official');

        expect(section.elements.webFields.hidden).toBe(true);
        expect(section.elements.apiKeyContainer.hidden).toBe(false);
        expect(section.elements.officialFields.hidden).toBe(false);
        expect(section.elements.openaiFields.hidden).toBe(true);
        expect(section.elements.apiKeyContainer.style.display).toBe('');

        section.updateVisibility('web');

        expect(section.elements.webFields.hidden).toBe(false);
        expect(section.elements.apiKeyContainer.hidden).toBe(true);
    });

    it('restores and reads the Gemini Web temporary chat checkbox', () => {
        const section = Object.create(ConnectionSection.prototype);
        const providerSelect = document.createElement('select');
        providerSelect.innerHTML = '<option value="web">Web</option>';
        const webTemporaryChat = document.createElement('input');
        webTemporaryChat.type = 'checkbox';
        section.elements = {
            providerSelect,
            webTemporaryChat,
        };
        section.mcpServers = [];
        section.mcpActiveServerId = null;
        section.updateVisibility = () => {};
        section._renderMcpServerOptions = () => {};
        section._loadActiveServerIntoForm = () => {};
        section.setMcpTestStatus = () => {};
        section._saveCurrentServerEdits = () => {};

        section.setData({ provider: 'web', webTemporaryChat: true });

        expect(webTemporaryChat.checked).toBe(true);
        expect(section.getData()).toMatchObject({
            provider: 'web',
            webTemporaryChat: true,
        });
    });

    it('toggles MCP settings with a hidden attribute', () => {
        const section = Object.create(ConnectionSection.prototype);
        section.elements = {
            mcpFields: document.createElement('div'),
        };

        section.updateMcpVisibility(true);

        expect(section.elements.mcpFields.hidden).toBe(false);
        expect(section.elements.mcpFields.style.display).toBe('');

        section.updateMcpVisibility(false);

        expect(section.elements.mcpFields.hidden).toBe(true);
    });

    it('uses a class for MCP test error state', () => {
        const status = document.createElement('div');
        const section = Object.create(ConnectionSection.prototype);
        section.elements = {
            mcpTestStatus: status,
        };

        section.setMcpTestStatus('Cannot connect', true);

        expect(status.textContent).toBe('Cannot connect');
        expect(status.classList.contains('is-error')).toBe(true);
        expect(status.hasAttribute('style')).toBe(false);

        section.setMcpTestStatus('Connected', false);

        expect(status.classList.contains('is-error')).toBe(false);
        expect(status.hasAttribute('style')).toBe(false);
    });
});
