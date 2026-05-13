// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { getMcpToolsSummaryText, groupMcpTools, renderMcpToolsUI } from './mcp_tools_view.js';

describe('MCP tools view', () => {
    it('summarizes tool exposure state', () => {
        expect(
            getMcpToolsSummaryText({
                server: { url: '' },
                tools: [],
                toolMode: 'all',
                enabledSet: new Set(),
            })
        ).toBe('Set Server URL to manage tools.');

        expect(
            getMcpToolsSummaryText({
                server: { url: 'http://localhost/mcp' },
                tools: [],
                toolMode: 'selected',
                enabledSet: new Set(),
            })
        ).toBe(
            'No tool list loaded. Click "Refresh Tools" to load tools, then select which to expose.'
        );

        expect(
            getMcpToolsSummaryText({
                server: { url: 'http://localhost/mcp' },
                tools: [{ name: 'a' }, { name: 'b' }],
                toolMode: 'selected',
                enabledSet: new Set(['a']),
            })
        ).toBe('Mode: selected. Tools exposed: 1/2.');
    });

    it('groups tools by prefix and keeps ungrouped tools last', () => {
        const groups = groupMcpTools([
            { name: 'browser.click' },
            { name: 'search' },
            { name: 'browser.snapshot' },
            { name: 'files.read' },
        ]);

        expect(groups.map((group) => group.name)).toEqual(['browser', 'files', '(other)']);
        expect(groups[0].tools.map((tool) => tool.name)).toEqual([
            'browser.click',
            'browser.snapshot',
        ]);
        expect(groups[2].tools.map((tool) => tool.name)).toEqual(['search']);
    });

    it('renders selected tool checkboxes and updates enabled tools', () => {
        const server = {
            id: 'srv',
            url: 'http://localhost/mcp',
            toolMode: 'selected',
            enabledTools: ['browser.click'],
        };
        const summary = document.createElement('div');
        const list = document.createElement('div');
        const rerender = vi.fn();

        renderMcpToolsUI({
            server,
            tools: [
                { name: 'browser.click', description: 'Click element' },
                { name: 'browser.snapshot', description: 'Snapshot page' },
            ],
            search: '',
            summaryElement: summary,
            listElement: list,
            uiState: { openGroups: new Set(['browser']) },
            onToolsChange: rerender,
        });

        expect(summary.textContent).toBe('Mode: selected. Tools exposed: 1/2.');
        expect(list.querySelector('summary')?.textContent).toContain('browser');
        expect(list.querySelector('summary')?.textContent).toContain('1/2');

        const toolCheckboxes = [...list.querySelectorAll('label input[type="checkbox"]')];
        expect(toolCheckboxes).toHaveLength(2);

        toolCheckboxes[1].checked = true;
        toolCheckboxes[1].dispatchEvent(new Event('change'));

        expect(server.enabledTools.sort()).toEqual(['browser.click', 'browser.snapshot']);
        expect(rerender).toHaveBeenCalledTimes(1);
    });
});
