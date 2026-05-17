import {
    asHttpUrl,
    asWsUrl,
    hasHeaders,
    inferTransport,
    mergeHeaders,
    normalizeHeaders,
    stableHeadersKey,
} from './mcp/transport.js';
import { normalizeMcpToolResult } from './mcp/tool_result.js';
import { filterToolsForPreamble, formatToolsPreamble } from './mcp/preamble.js';
import { getActiveMcpServers, parseToolId, tagToolsForServer } from './mcp/server_tools.js';
import { readSseStream } from './mcp/sse_stream.js';
import {
    clearListCache,
    listPromptsForConnection,
    listResourceTemplatesForConnection,
    listResourcesForConnection,
    listToolsForConnection,
} from './mcp/tool_listing.js';
import {
    handleIncomingRpcMessage,
    sendNotification,
    terminateStreamableHttpSession,
} from './mcp/rpc_messages.js';
import { isStreamableHttpFallbackError, sendStreamableHttpRpc } from './mcp/streamable_http.js';

const DEFAULT_PROTOCOL_VERSIONS = [
    '2025-11-25',
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
    '2024-10-07',
    '2024-06-20',
];

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
            listCaches: new Map(),
            idleCloseTimer: null,
            sseAbort: null,
            ssePostUrl: null,
            sseReaderTask: null,
            httpPostUrl: null,
            headers: {},
            sessionId: null,
            protocolVersion: null,
            serverCapabilities: {},
            serverInfo: null,
            instructions: '',
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
        clearListCache(conn);
        terminateStreamableHttpSession(conn);
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
        conn.serverCapabilities = {};
        conn.serverInfo = null;
        conn.instructions = '';
    }

    _resolvePendingRpcMessage(conn, msg) {
        if (!msg || typeof msg !== 'object' || msg.id === undefined) return;

        const entry = conn.pending.get(msg.id);
        if (!entry) return;

        clearTimeout(entry.timeout);
        conn.pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(msg.error.message || 'MCP error'));
        else entry.resolve(msg.result);
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
            return sendStreamableHttpRpc(conn, method, params, {
                nextId: () => this.nextId++,
                initializeHandshake: () => this._initializeHandshake(conn),
                onMessage: (msg) =>
                    handleIncomingRpcMessage(conn, msg, (state, rpcMessage) =>
                        this._resolvePendingRpcMessage(state, rpcMessage)
                    ),
            });
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

        const requestPromise = new Promise((resolve, reject) => {
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
            }).catch((error) => {
                const entry = conn.pending.get(id);
                if (entry) {
                    clearTimeout(entry.timeout);
                    conn.pending.delete(id);
                    entry.reject(new Error(`MCP POST failed: ${error?.message || String(error)}`));
                }
            });
        }
        return requestPromise;
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
                        handleIncomingRpcMessage(conn, msg, (state, rpcMessage) =>
                            this._resolvePendingRpcMessage(state, rpcMessage)
                        );
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
                conn.initialized &&
                conn.configKey === key &&
                ((conn.transport === 'streamable-http' && conn.httpPostUrl) ||
                    (conn.transport === 'sse' && conn.ssePostUrl))
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

            try {
                await this._initializeHandshake(conn);
            } catch (error) {
                if (!isStreamableHttpFallbackError(error)) throw error;

                this._disconnectState(conn);
                conn.configKey = key;
                conn.transport = 'sse';
                conn.headers = normalizedHeaders;
                await this._connectSse(conn, httpUrl);
                await this._initializeHandshake(conn);
            }
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

        conn.sseReaderTask = readSseStream(conn, response.body.getReader(), sseUrl, {
            resolvePendingRpcMessage: (msg) =>
                handleIncomingRpcMessage(conn, msg, (state, rpcMessage) =>
                    this._resolvePendingRpcMessage(state, rpcMessage)
                ),
            clearPending: (error) => this._clearPending(conn, error),
        }).catch(() => {});

        const postUrl = await endpointPromise;
        conn.ssePostUrl = postUrl;
    }

    async _initializeHandshake(conn) {
        let lastError = null;
        for (const protocolVersion of DEFAULT_PROTOCOL_VERSIONS) {
            try {
                const result = await this._sendRpc(conn, 'initialize', {
                    protocolVersion,
                    capabilities: {},
                    clientInfo: { name: this.clientName, version: this.clientVersion },
                });

                const selectedProtocolVersion =
                    result && typeof result.protocolVersion === 'string'
                        ? result.protocolVersion
                        : protocolVersion;
                if (!DEFAULT_PROTOCOL_VERSIONS.includes(selectedProtocolVersion)) {
                    throw new Error(`Unsupported MCP protocol version: ${selectedProtocolVersion}`);
                }

                conn.protocolVersion = selectedProtocolVersion;
                conn.serverCapabilities =
                    result && result.capabilities && typeof result.capabilities === 'object'
                        ? result.capabilities
                        : {};
                conn.serverInfo =
                    result && result.serverInfo && typeof result.serverInfo === 'object'
                        ? result.serverInfo
                        : null;
                conn.instructions =
                    result && typeof result.instructions === 'string' ? result.instructions : '';
                sendNotification(conn, 'notifications/initialized', {});
                conn.initialized = true;
                return;
            } catch (error) {
                lastError = error;
                if (isStreamableHttpFallbackError(error)) throw error;
                if (
                    error &&
                    typeof error.message === 'string' &&
                    error.message.startsWith('Unsupported MCP protocol version:')
                ) {
                    throw error;
                }
                await sleep(150);
            }
        }
        throw lastError || new Error('Failed to initialize MCP connection');
    }

    async _listToolsForConnection(conn) {
        return listToolsForConnection(conn, (method, params) =>
            this._sendRpc(conn, method, params)
        );
    }

    async _listPromptsForConnection(conn) {
        return listPromptsForConnection(conn, (method, params) =>
            this._sendRpc(conn, method, params)
        );
    }

    async _listResourcesForConnection(conn) {
        return listResourcesForConnection(conn, (method, params) =>
            this._sendRpc(conn, method, params)
        );
    }

    async _listResourceTemplatesForConnection(conn) {
        return listResourceTemplatesForConnection(conn, (method, params) =>
            this._sendRpc(conn, method, params)
        );
    }

    // List tools for a single server (legacy compatibility)
    async listTools(config) {
        const conn = await this._ensureConnected(config);
        return this._listToolsForConnection(conn);
    }

    async listPrompts(config) {
        const conn = await this._ensureConnected(config);
        return this._listPromptsForConnection(conn);
    }

    async getPrompt(config, name, args = {}) {
        const conn = await this._ensureConnected(config);
        return this._sendRpc(conn, 'prompts/get', { name, arguments: args || {} });
    }

    async listResources(config) {
        const conn = await this._ensureConnected(config);
        return this._listResourcesForConnection(conn);
    }

    async readResource(config, uri) {
        const conn = await this._ensureConnected(config);
        return this._sendRpc(conn, 'resources/read', { uri });
    }

    async listResourceTemplates(config) {
        const conn = await this._ensureConnected(config);
        return this._listResourceTemplatesForConnection(conn);
    }

    // List tools for a specific server by ID
    async listToolsForServer(serverId, transport, url, headers = {}) {
        const conn = await this._ensureConnectedForServer(serverId, transport, url, headers);
        return this._listToolsForConnection(conn);
    }

    // List tools from all enabled servers (multi-server mode)
    async listAllActiveTools(servers) {
        const activeServers = getActiveMcpServers(servers);
        if (activeServers.length === 0) return [];

        const results = await Promise.allSettled(
            activeServers.map(async (server) => {
                const tools = await this.listToolsForServer(
                    server.id,
                    server.transport,
                    server.url,
                    server.headers
                );
                return tagToolsForServer(server, tools);
            })
        );

        const allTools = [];
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'fulfilled') {
                allTools.push(...result.value);
            } else {
                console.error('[MCP] Server', activeServers[i].id, 'failed:', result.reason);
            }
        }
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

        let allTools = [];
        if (isMulti) {
            allTools = await this.listAllActiveTools(servers);
        } else {
            allTools = await this.listTools(config);
        }

        const enabledTools = filterToolsForPreamble(allTools, { isMulti, servers, config });
        return formatToolsPreamble(enabledTools);
    }
}
