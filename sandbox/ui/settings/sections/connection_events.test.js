// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendToBackground } from '../../../../shared/messaging/index.js';
import { bindConnectionSectionEvents } from './connection_events.js';

vi.mock('../../../../shared/messaging/index.js', () => ({
    sendToBackground: vi.fn(),
}));

vi.mock('../../../core/i18n.js', () => ({
    t: (key) => key,
}));

function createSectionHarness() {
    const mcpTestConnection = document.createElement('button');
    const server = {
        id: 'srv-1',
        transport: 'sse',
        url: 'http://localhost/sse',
        headers: { Authorization: 'Bearer local' },
    };
    const section = {
        elements: {
            mcpTestConnection,
        },
        _getActiveServer: vi.fn(() => server),
        _saveCurrentServerEdits: vi.fn(() => true),
        setMcpTestStatus: vi.fn(),
    };

    return { mcpTestConnection, section, server };
}

describe('bindConnectionSectionEvents', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends the active server when testing an MCP connection', () => {
        const { mcpTestConnection, section } = createSectionHarness();

        bindConnectionSectionEvents(section);
        mcpTestConnection.click();

        expect(section._saveCurrentServerEdits).toHaveBeenCalled();
        expect(section.setMcpTestStatus).toHaveBeenCalledWith('mcpTestingConnection');
        expect(sendToBackground).toHaveBeenCalledWith({
            action: 'MCP_TEST_CONNECTION',
            serverId: 'srv-1',
            transport: 'sse',
            url: 'http://localhost/sse',
            headers: { Authorization: 'Bearer local' },
        });
    });
});
