// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { ConnectionSection } from './connection.js';

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
