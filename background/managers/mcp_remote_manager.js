import {
    asHttpUrl,
    asWsUrl,
    hasHeaders,
    inferTransport,
    mergeHeaders,
    mergeHttpTransportHeaders,
    normalizeHeaders,
    stableHeadersKey,
} from './mcp/transport.js';
import { normalizeMcpToolResult } from './mcp/tool_result.js';
import { filterToolsForPreamble, formatToolsPreamble } from './mcp/preamble.js';
import { getActiveMcpServers, parseToolId, tagToolsForServer } from './mcp/server_tools.js';

const DEFAULT_PROTOCOL_VERSIONS = ['2024-11-05', '2024-10-07', '2024-06-20'];
const DEBUG_MCP_REMOTE = false;

function debugMcpRemote(...args) {
    if (DEBUG_MCP_REMOTE) {
        console.debug(...args);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class McpRemoteManager {
    constructor({ clientName = 'gemini-nexus', clientVersion = '0.0.0' } = {}) {
        this.clientName = clientName;
        this.clientVersion = clientVersion;

        // Multi-connection support: Map<serverId, ConnectionState>
        this.connections = new Map();
        this.nextId = 1;
    }

    // Create a fresh connection state object
    _createConnectionState() {
        return {
            transport: null,
            ws: null,
            configKey: null,
            pending: new Map(),
            initialized: false,
            toolsCache: null,
            toolsCacheAt: 0,
            idleCloseTimer: null,
            sseAbort: null,
            ssePostUrl: null,
            sseReaderTask: null,
            httpPostUrl: null,
            headers: {},
            sessionId: null,
            protocolVersion: null,
            _resolveSseEndpoint: null,
        };
    }

    isEnabled(config) {
        const enabled = config && (config.enableMcpTools === true || config.mcpEnabled === true);
        return !!(enabled && config.mcpServerUrl);
    }

    // Check if multi-server mode is enabled
    isMultiEnabled(config) {
        if (!config || config.enableMcpTools !== true) return false;
        const servers = config.mcpServers;
        if (!Array.isArray(servers)) return false;
        return servers.some((s) => s && s.enabled !== false && s.url && s.url.trim());
    }

    async disconnect(serverId) {
        if (serverId) {
            // Disconnect specific server
            const conn = this.connections.get(serverId);
            if (conn) {
                this._disconnectState(conn);
                this.connections.delete(serverId);
            }
        } else {
            // Disconnect all
            for (const [id, conn] of this.connections.entries()) {
                this._disconnectState(conn);
            }
            this.connections.clear();
        }
    }

    _disconnectState(conn) {
        if (conn.idleCloseTimer) {
            clearTimeout(conn.idleCloseTimer);
            conn.idleCloseTimer = null;
        }
        this._clearPending(conn, new Error('MCP connection closed'));
        conn.toolsCache = null;
        conn.toolsCacheAt = 0;
        conn.initialized = false;
        conn.configKey = null;
        conn.transport = null;

        if (conn.ws) {
            try {
                conn.ws.close();
            } catch {}
        }
        conn.ws = null;

        if (conn.sseAbort) {
            try {
                conn.sseAbort.abort();
            } catch {}
        }
        conn.sseAbort = null;
        conn.ssePostUrl = null;
        conn.sseReaderTask = null;
        conn.httpPostUrl = null;
        conn.headers = {};
        conn.sessionId = null;
        conn.protocolVersion = null;
    }

    _clearIdleTimer(conn) {
        if (conn.idleCloseTimer) {
            clearTimeout(conn.idleCloseTimer);
            conn.idleCloseTimer = null;
        }
    }

    _bumpIdleClose(conn, serverId) {
        this._clearIdleTimer(conn);
        conn.idleCloseTimer = setTimeout(() => {
            this.disconnect(serverId).catch(() => {});
        }, 120000);
    }

    _clearPending(conn, error) {
        for (const [id, entry] of conn.pending.entries()) {
            clearTimeout(entry.timeout);
            entry.reject(error);
            conn.pending.delete(id);
        }
    }

    async _sendRpc(conn, method, params) {
        if (conn.transport === 'streamable-http') {
            return await this._sendRpcStreamableHttp(conn, method, params);
        }

        if (conn.transport === 'ws') {
            if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
                throw new Error('MCP WebSocket not connected');
            }
        } else if (conn.transport === 'sse') {
            if (!conn.ssePostUrl) {
                throw new Error('MCP SSE not connected');
            }
        } else {
            throw new Error('MCP transport not connected');
        }

        const id = this.nextId++;
        const msg = {
            jsonrpc: '2.0',
            id,
            method,
            params: params || {},
        };

        const p = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                conn.pending.delete(id);
                reject(new Error(`MCP request timeout: ${method}`));
            }, 30000);

            conn.pending.set(id, { resolve, reject, timeout });
        });

        if (conn.transport === 'ws') {
            conn.ws.send(JSON.stringify(msg));
        } else {
            fetch(conn.ssePostUrl, {
                method: 'POST',
                headers: mergeHeaders({ 'Content-Type': 'application/json' }, conn.headers),
                body: JSON.stringify(msg),
            }).catch((err) => {
                const entry = conn.pending.get(id);
                if (entry) {
                    clearTimeout(entry.timeout);
                    conn.pending.delete(id);
                    entry.reject(new Error(`MCP POST failed: ${err?.message || String(err)}`));
                }
            });
        }
        return p;
    }

    _sendNotification(conn, method, params) {
        const msg = { jsonrpc: '2.0', method, params: params || {} };
        if (conn.transport === 'ws') {
            if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;
            conn.ws.send(JSON.stringify(msg));
            return;
        }

        if (conn.transport === 'sse') {
            if (!conn.ssePostUrl) return;
            fetch(conn.ssePostUrl, {
                method: 'POST',
                headers: mergeHeaders({ 'Content-Type': 'application/json' }, conn.headers),
                body: JSON.stringify(msg),
            }).catch(() => {});
            return;
        }

        if (conn.transport === 'streamable-http') {
            if (!conn.httpPostUrl) return;
            fetch(conn.httpPostUrl, {
                method: 'POST',
                headers: mergeHttpTransportHeaders(conn, {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/event-stream',
                }),
                body: JSON.stringify(msg),
            }).catch(() => {});
        }
    }

    // Get or create connection for a server
    _getOrCreateConnection(serverId) {
        if (!this.connections.has(serverId)) {
            this.connections.set(serverId, this._createConnectionState());
        }
        return this.connections.get(serverId);
    }

    async _ensureConnectedForServer(serverId, transport, url, headers = {}) {
        const conn = this._getOrCreateConnection(serverId);
        const transportLower = inferTransport(transport, url);
        const normalizedHeaders = normalizeHeaders(headers);
        const headerKey = stableHeadersKey(normalizedHeaders);

        if (transportLower === 'ws' || transportLower === 'websocket') {
            if (hasHeaders(normalizedHeaders)) {
                throw new Error(
                    'Custom MCP headers are not supported for WebSocket transport in browser extensions. Use SSE or Streamable HTTP.'
                );
            }

            const wsUrl = asWsUrl(url);
            if (!wsUrl) throw new Error('Invalid MCP server URL');
            const key = `ws:${wsUrl}`;

            if (
                conn.ws &&
                conn.ws.readyState === WebSocket.OPEN &&
                conn.initialized &&
                conn.configKey === key
            ) {
                this._bumpIdleClose(conn, serverId);
                return conn;
            }

            this._disconnectState(conn);
            conn.configKey = key;
            conn.transport = 'ws';
            conn.headers = {};

            await new Promise((resolve, reject) => {
                const ws = new WebSocket(wsUrl);
                conn.ws = ws;
                let opened = false;

                const onOpen = () => {
                    opened = true;
                    resolve();
                };
                const onError = () => {
                    if (!opened) reject(new Error(`Failed to connect to MCP WebSocket: ${wsUrl}`));
                };
                const onClose = () => {
                    const err = new Error(`MCP WebSocket closed: ${wsUrl}`);
                    this._clearPending(conn, err);
                    conn.ws = null;
                    conn.initialized = false;
                    conn.configKey = null;
                    conn.transport = null;
                    if (!opened) reject(err);
                };
                const onMessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg && typeof msg === 'object' && msg.id !== undefined) {
                            const entry = conn.pending.get(msg.id);
                            if (entry) {
                                clearTimeout(entry.timeout);
                                conn.pending.delete(msg.id);
                                if (msg.error)
                                    entry.reject(new Error(msg.error.message || 'MCP error'));
                                else entry.resolve(msg.result);
                            }
                        }
                    } catch {}
                };

                ws.addEventListener('open', onOpen);
                ws.addEventListener('error', onError);
                ws.addEventListener('close', onClose);
                ws.addEventListener('message', onMessage);
            });

            await this._initializeHandshake(conn);
            this._bumpIdleClose(conn, serverId);
            return conn;
        }

        if (transportLower === 'sse') {
            const sseUrlStr = asHttpUrl(url);
            if (!sseUrlStr) throw new Error('Invalid MCP SSE URL');
            const key = `sse:${sseUrlStr}:${headerKey}`;

            if (
                conn.transport === 'sse' &&
                conn.initialized &&
                conn.configKey === key &&
                conn.ssePostUrl
            ) {
                this._bumpIdleClose(conn, serverId);
                return conn;
            }

            this._disconnectState(conn);
            conn.configKey = key;
            conn.transport = 'sse';
            conn.headers = normalizedHeaders;

            await this._connectSse(conn, sseUrlStr);
            await this._initializeHandshake(conn);
            this._bumpIdleClose(conn, serverId);
            return conn;
        }

        if (transportLower === 'streamable-http' || transportLower === 'streamablehttp') {
            const httpUrl = asHttpUrl(url);
            if (!httpUrl) throw new Error('Invalid Streamable HTTP URL');
            const key = `streamable-http:${httpUrl}:${headerKey}`;

            if (
                conn.transport === 'streamable-http' &&
                conn.initialized &&
                conn.configKey === key &&
                conn.httpPostUrl
            ) {
                this._bumpIdleClose(conn, serverId);
                return conn;
            }

            this._disconnectState(conn);
            conn.configKey = key;
            conn.transport = 'streamable-http';
            conn.httpPostUrl = httpUrl;
            conn.headers = normalizedHeaders;
            conn.sessionId = null;
            conn.protocolVersion = null;

            await this._initializeHandshake(conn);
            this._bumpIdleClose(conn, serverId);
            return conn;
        }

        throw new Error(`Unsupported MCP transport: ${transport}`);
    }

    // Legacy single-server compatibility
    async _ensureConnected(config) {
        if (!this.isEnabled(config)) {
            throw new Error('MCP is not enabled or server URL is missing.');
        }
        const serverId = config.mcpServerId || '_legacy_';
        return await this._ensureConnectedForServer(
            serverId,
            config.mcpTransport,
            config.mcpServerUrl,
            config.mcpHeaders
        );
    }

    async _sendRpcStreamableHttp(conn, method, params) {
        if (!conn.httpPostUrl) throw new Error('MCP Streamable HTTP not connected');

        const id = this.nextId++;
        const msg = {
            jsonrpc: '2.0',
            id,
            method,
            params: params || {},
        };

        const response = await fetch(conn.httpPostUrl, {
            method: 'POST',
            headers: mergeHttpTransportHeaders(conn, {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            }),
            body: JSON.stringify(msg),
        });

        const sessionId = response.headers.get('Mcp-Session-Id');
        if (sessionId) conn.sessionId = sessionId;

        const text = await response.text();

        if (!response.ok) {
            throw new Error(
                `MCP Streamable HTTP error (${response.status}): ${text || response.statusText}`
            );
        }

        try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.error) throw new Error(parsed.error.message || 'MCP error');
            if (parsed && parsed.result !== undefined) return parsed.result;
            return parsed;
        } catch (error) {
            if (error instanceof SyntaxError) {
                return this._parseStreamableHttpTextFallback(text);
            }
            throw error;
        }
    }

    _parseStreamableHttpTextFallback(text) {
        const trimmed = (text || '').trim();
        const lastBrace = trimmed.lastIndexOf('}');
        const firstBrace = trimmed.indexOf('{');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const candidate = trimmed.slice(firstBrace, lastBrace + 1);
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && parsed.error) throw new Error(parsed.error.message || 'MCP error');
                if (parsed && parsed.result !== undefined) return parsed.result;
                return parsed;
            } catch (error) {
                if (!(error instanceof SyntaxError)) throw error;
            }
        }
        return { content: [{ type: 'text', text: trimmed }] };
    }

    async _connectSse(conn, sseUrlStr) {
        const sseUrl = new URL(sseUrlStr);
        const abort = new AbortController();
        conn.sseAbort = abort;
        conn.ssePostUrl = null;

        const endpointPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error('MCP SSE endpoint handshake timeout')),
                10000
            );
            conn._resolveSseEndpoint = (url) => {
                clearTimeout(timeout);
                resolve(url);
            };
        });

        const response = await fetch(sseUrl.toString(), {
            method: 'GET',
            headers: mergeHeaders(
                { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
                conn.headers
            ),
            signal: abort.signal,
        });

        if (!response.ok)
            throw new Error(`MCP SSE connect failed (${response.status}): ${response.statusText}`);
        if (!response.body) throw new Error('MCP SSE response has no body');

        conn.sseReaderTask = this._readSseStream(conn, response.body.getReader(), sseUrl).catch(
            () => {}
        );

        const postUrl = await endpointPromise;
        conn.ssePostUrl = postUrl;
    }

    async _readSseStream(conn, reader, baseUrl) {
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let eventType = 'message';
        let dataLines = [];

        const dispatch = () => {
            const data = dataLines.join('\n');
            const type = eventType || 'message';
            eventType = 'message';
            dataLines = [];

            const payload = data.trim();
            if (!payload) return;

            if (type === 'endpoint') {
                let endpoint = payload;
                try {
                    const parsed = JSON.parse(payload);
                    if (
                        parsed &&
                        typeof parsed === 'object' &&
                        typeof parsed.endpoint === 'string'
                    ) {
                        endpoint = parsed.endpoint;
                    }
                } catch {}

                try {
                    const url = new URL(endpoint, baseUrl).toString();
                    if (!conn.ssePostUrl) {
                        conn.ssePostUrl = url;
                        if (conn._resolveSseEndpoint) conn._resolveSseEndpoint(url);
                    }
                } catch {}
                return;
            }

            if (type === 'message' || type === 'mcp' || type === 'data') {
                try {
                    const msg = JSON.parse(payload);
                    if (msg && typeof msg === 'object' && msg.id !== undefined) {
                        const entry = conn.pending.get(msg.id);
                        if (entry) {
                            clearTimeout(entry.timeout);
                            conn.pending.delete(msg.id);
                            if (msg.error)
                                entry.reject(new Error(msg.error.message || 'MCP error'));
                            else entry.resolve(msg.result);
                        }
                    }
                } catch {}
            }
        };

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 1);
                    const trimmed = line.replace(/\r$/, '');

                    if (trimmed === '') {
                        dispatch();
                        continue;
                    }
                    if (trimmed.startsWith(':')) continue;
                    if (trimmed.startsWith('event:')) {
                        eventType = trimmed.slice('event:'.length).trim() || 'message';
                        continue;
                    }
                    if (trimmed.startsWith('data:')) {
                        dataLines.push(trimmed.slice('data:'.length).trimStart());
                        continue;
                    }
                }
            }
        } finally {
            try {
                reader.releaseLock();
            } catch {}
            this._clearPending(conn, new Error('MCP SSE stream closed'));
            conn.initialized = false;
            conn.transport = null;
            conn.configKey = null;
            conn.sseAbort = null;
            conn.ssePostUrl = null;
        }
    }

    async _initializeHandshake(conn) {
        let lastError = null;
        for (const protocolVersion of DEFAULT_PROTOCOL_VERSIONS) {
            try {
                await this._sendRpc(conn, 'initialize', {
                    protocolVersion,
                    capabilities: {},
                    clientInfo: { name: this.clientName, version: this.clientVersion },
                });

                conn.protocolVersion = protocolVersion;
                this._sendNotification(conn, 'notifications/initialized', {});
                conn.initialized = true;
                return;
            } catch (e) {
                lastError = e;
                await sleep(150);
            }
        }
        throw lastError || new Error('Failed to initialize MCP connection');
    }

    // List tools for a single server (legacy compatibility)
    async listTools(config) {
        const conn = await this._ensureConnected(config);

        const now = Date.now();
        if (conn.toolsCache && now - conn.toolsCacheAt < 5 * 60 * 1000) {
            return conn.toolsCache;
        }

        const result = await this._sendRpc(conn, 'tools/list', {});
        const tools = result && Array.isArray(result.tools) ? result.tools : [];
        conn.toolsCache = tools;
        conn.toolsCacheAt = now;
        return tools;
    }

    // List tools for a specific server by ID
    async listToolsForServer(serverId, transport, url, headers = {}) {
        const conn = await this._ensureConnectedForServer(serverId, transport, url, headers);

        const now = Date.now();
        if (conn.toolsCache && now - conn.toolsCacheAt < 5 * 60 * 1000) {
            return conn.toolsCache;
        }

        const result = await this._sendRpc(conn, 'tools/list', {});
        const tools = result && Array.isArray(result.tools) ? result.tools : [];
        conn.toolsCache = tools;
        conn.toolsCacheAt = now;
        return tools;
    }

    // List tools from all enabled servers (multi-server mode)
    async listAllActiveTools(servers) {
        const activeServers = getActiveMcpServers(servers);
        debugMcpRemote(
            '[MCP] listAllActiveTools: activeServers count:',
            activeServers.length,
            activeServers.map((s) => ({ id: s.id, name: s.name, url: s.url }))
        );
        if (activeServers.length === 0) return [];

        const results = await Promise.allSettled(
            activeServers.map(async (server) => {
                debugMcpRemote('[MCP] Connecting to server:', server.id, server.url);
                const tools = await this.listToolsForServer(
                    server.id,
                    server.transport,
                    server.url,
                    server.headers
                );
                debugMcpRemote('[MCP] Server', server.id, 'returned', tools.length, 'tools');
                return tagToolsForServer(server, tools);
            })
        );

        const allTools = [];
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'fulfilled') {
                debugMcpRemote(
                    '[MCP] Server',
                    activeServers[i].id,
                    'fulfilled with',
                    result.value.length,
                    'tools'
                );
                allTools.push(...result.value);
            } else {
                console.error('[MCP] Server', activeServers[i].id, 'failed:', result.reason);
            }
        }
        debugMcpRemote('[MCP] Total tools from all servers:', allTools.length);
        return allTools;
    }

    // Call tool (legacy single-server)
    async callTool(config, toolName, args) {
        const conn = await this._ensureConnected(config);

        const result = await this._sendRpc(conn, 'tools/call', {
            name: toolName,
            arguments: args || {},
        });

        return normalizeMcpToolResult(result);
    }

    // Call tool by full tool ID (multi-server mode): serverId__toolName
    async callToolById(toolId, args, servers) {
        const { serverId, toolName } = parseToolId(toolId);

        const server = servers.find((s) => s.id === serverId);
        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }

        const conn = await this._ensureConnectedForServer(
            serverId,
            server.transport,
            server.url,
            server.headers
        );
        const result = await this._sendRpc(conn, 'tools/call', {
            name: toolName,
            arguments: args || {},
        });

        return normalizeMcpToolResult(result);
    }

    // Build preamble for multi-server mode
    async buildToolsPreamble(config) {
        const servers = config.mcpServers;
        const isMulti = this.isMultiEnabled(config);
        debugMcpRemote('[MCP] buildToolsPreamble: isMulti=', isMulti, 'servers=', servers?.length);

        let allTools = [];
        if (isMulti) {
            allTools = await this.listAllActiveTools(servers);
            debugMcpRemote(
                '[MCP] buildToolsPreamble: allTools after listAllActiveTools:',
                allTools.length
            );
        } else {
            allTools = await this.listTools(config);
        }

        const enabledTools = filterToolsForPreamble(allTools, { isMulti, servers, config });
        return formatToolsPreamble(enabledTools);
    }
}
