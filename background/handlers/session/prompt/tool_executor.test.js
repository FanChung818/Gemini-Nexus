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

    it('blocks routed MCP tools that are not selected for their server', async () => {
        const mcpManager = {
            isEnabled: vi.fn(() => true),
            callToolById: vi.fn(async () => ({ text: 'secret result', files: [] })),
        };
        const executor = new ToolExecutor(null, mcpManager);

        const result = await executor.executeCommand(
            { name: 'srv1__secret', args: {} },
            {
                sessionId: 'session-1',
                enableMcpTools: true,
                mcpServers: [
                    {
                        id: 'srv1',
                        transport: 'sse',
                        url: 'http://127.0.0.1:3006/sse',
                        enabled: true,
                        toolMode: 'selected',
                        enabledTools: ['allowed'],
                    },
                ],
            },
            '{"tool":"srv1__secret","args":{}}'
        );

        expect(mcpManager.callToolById).not.toHaveBeenCalled();
        expect(result).toEqual(
            expect.objectContaining({
                source: 'mcp_remote',
                status: 'failed',
                output: expect.stringContaining(
                    "External MCP tool 'secret' is disabled (not in selected tools)."
                ),
            })
        );
    });

    it('uses an enabled duplicate tool when an earlier server has the same tool disabled', async () => {
        const mcpManager = {
            isEnabled: vi.fn(() => true),
            listAllActiveTools: vi.fn(async () => [
                { name: 'search', _serverId: 'srv1', _toolId: 'srv1__search' },
                { name: 'search', _serverId: 'srv2', _toolId: 'srv2__search' },
            ]),
            callToolById: vi.fn(async () => ({ text: 'enabled search', files: [] })),
        };
        const executor = new ToolExecutor(null, mcpManager);

        const servers = [
            {
                id: 'srv1',
                transport: 'sse',
                url: 'http://127.0.0.1:3006/sse',
                enabled: true,
                toolMode: 'selected',
                enabledTools: ['read'],
            },
            {
                id: 'srv2',
                transport: 'sse',
                url: 'http://127.0.0.1:3007/sse',
                enabled: true,
                toolMode: 'selected',
                enabledTools: ['search'],
            },
        ];

        const result = await executor.executeCommand(
            { name: 'search', args: { q: 'mcp' } },
            {
                sessionId: 'session-1',
                enableMcpTools: true,
                mcpServers: servers,
            },
            '{"tool":"search","args":{"q":"mcp"}}'
        );

        expect(mcpManager.callToolById).toHaveBeenCalledWith('srv2__search', { q: 'mcp' }, servers);
        expect(result).toEqual(
            expect.objectContaining({
                source: 'mcp_remote',
                status: 'completed',
                output: 'enabled search',
            })
        );
    });

    it('marks MCP tool-call results with isError as failed execution status', async () => {
        const mcpManager = {
            isEnabled: vi.fn(() => true),
            callTool: vi.fn(async () => ({
                text: 'permission denied',
                files: [],
                isError: true,
            })),
        };
        const executor = new ToolExecutor(null, mcpManager);

        const result = await executor.executeCommand(
            { name: 'read_secret', args: {} },
            {
                sessionId: 'session-1',
                enableMcpTools: true,
                mcpTransport: 'streamable-http',
                mcpServerUrl: 'http://127.0.0.1:3006/mcp',
            },
            '{"tool":"read_secret","args":{}}'
        );

        expect(result).toEqual(
            expect.objectContaining({
                source: 'mcp_remote',
                status: 'failed',
                output: 'permission denied',
            })
        );
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: 'failed',
                text: 'permission denied',
            })
        );
    });
});
