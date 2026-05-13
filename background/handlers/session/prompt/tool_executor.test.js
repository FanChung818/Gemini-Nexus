import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolExecutor } from './tool_executor.js';

describe('ToolExecutor routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.chrome = {
            runtime: {
                sendMessage: vi.fn(() => Promise.resolve()),
            },
        };
    });

    it('routes local-name tools to MCP when browser control is disabled', async () => {
        const controlManager = {
            execute: vi.fn(async () => 'local click'),
        };
        const mcpManager = {
            isEnabled: vi.fn(() => true),
            callTool: vi.fn(async () => ({ text: 'remote click', files: [] })),
        };
        const executor = new ToolExecutor(controlManager, mcpManager);

        const result = await executor.executeCommand(
            { name: 'click', args: { selector: '#remote' } },
            {
                sessionId: 'session-1',
                enableBrowserControl: false,
                enableMcpTools: true,
                mcpTransport: 'sse',
                mcpServerUrl: 'http://127.0.0.1:3006/sse',
            },
            '{"tool":"click","args":{"selector":"#remote"}}'
        );

        expect(controlManager.execute).not.toHaveBeenCalled();
        expect(mcpManager.callTool).toHaveBeenCalledWith(
            expect.objectContaining({ enableMcpTools: true }),
            'click',
            { selector: '#remote' }
        );
        expect(result).toEqual(
            expect.objectContaining({
                source: 'mcp_remote',
                output: 'remote click',
                status: 'completed',
            })
        );
    });
});
