import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpRemoteManager } from './mcp_remote_manager.js';

function jsonResponse(body, headers = {}) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });
}

describe('McpRemoteManager protocol integration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('performs Streamable HTTP initialize, list, and call with session headers', async () => {
        const requests = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url, init = {}) => {
                const body = JSON.parse(init.body || '{}');
                requests.push({ url, headers: init.headers, body });

                if (body.method === 'initialize') {
                    return jsonResponse(
                        { jsonrpc: '2.0', id: body.id, result: {} },
                        {
                            'Mcp-Session-Id': 'session-1',
                        }
                    );
                }
                if (body.method === 'tools/list') {
                    return jsonResponse({
                        jsonrpc: '2.0',
                        id: body.id,
                        result: { tools: [{ name: 'search', description: 'Search docs' }] },
                    });
                }
                if (body.method === 'tools/call') {
                    return jsonResponse({
                        jsonrpc: '2.0',
                        id: body.id,
                        result: { content: [{ type: 'text', text: 'found it' }] },
                    });
                }
                return jsonResponse({ jsonrpc: '2.0', result: {} });
            })
        );

        const manager = new McpRemoteManager({ clientVersion: 'test' });
        const tools = await manager.listToolsForServer(
            'docs',
            'streamable-http',
            'http://localhost/mcp',
            { Authorization: 'Bearer local' }
        );
        const result = await manager.callToolById('docs__search', { q: 'nexus' }, [
            {
                id: 'docs',
                transport: 'streamable-http',
                url: 'http://localhost/mcp',
                headers: { Authorization: 'Bearer local' },
            },
        ]);

        expect(tools).toEqual([{ name: 'search', description: 'Search docs' }]);
        expect(result).toEqual({ text: 'found it', files: [] });
        expect(
            requests.find((request) => request.body.method === 'tools/list').headers
        ).toMatchObject({
            Authorization: 'Bearer local',
            'Mcp-Session-Id': 'session-1',
        });
        expect(
            requests.find((request) => request.body.method === 'tools/call').headers
        ).toMatchObject({
            Authorization: 'Bearer local',
            'Mcp-Session-Id': 'session-1',
        });
    });

    it('rejects Streamable HTTP JSON-RPC error responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url, init = {}) => {
                const body = JSON.parse(init.body || '{}');
                if (body.method === 'initialize') {
                    return jsonResponse({ jsonrpc: '2.0', id: body.id, result: {} });
                }
                return jsonResponse({
                    jsonrpc: '2.0',
                    id: body.id,
                    error: { code: -32601, message: 'Tool not found' },
                });
            })
        );

        const manager = new McpRemoteManager({ clientVersion: 'test' });

        await expect(
            manager.listToolsForServer('docs', 'streamable-http', 'http://localhost/mcp')
        ).rejects.toThrow('Tool not found');
    });

    it('performs SSE endpoint discovery and resolves RPC responses from the event stream', async () => {
        const encoder = new TextEncoder();
        let controller;

        const stream = new ReadableStream({
            start(nextController) {
                controller = nextController;
                controller.enqueue(encoder.encode('event: endpoint\ndata: /messages\n\n'));
            },
        });

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url, init = {}) => {
                if (!init || init.method === 'GET') {
                    return new Response(stream, {
                        status: 200,
                        headers: { 'Content-Type': 'text/event-stream' },
                    });
                }

                const body = JSON.parse(init.body || '{}');
                queueMicrotask(() => {
                    const result =
                        body.method === 'tools/list'
                            ? { tools: [{ name: 'read_file', description: 'Read a file' }] }
                            : {};
                    controller.enqueue(
                        encoder.encode(
                            `event: message\ndata: ${JSON.stringify({
                                jsonrpc: '2.0',
                                id: body.id,
                                result,
                            })}\n\n`
                        )
                    );
                });
                return new Response('', { status: 202 });
            })
        );

        const manager = new McpRemoteManager({ clientVersion: 'test' });
        const tools = await manager.listToolsForServer('local', 'sse', 'http://localhost/sse');

        expect(tools).toEqual([{ name: 'read_file', description: 'Read a file' }]);
        expect(fetch).toHaveBeenCalledWith('http://localhost/messages', expect.any(Object));

        await manager.disconnect('local');
    });
});
