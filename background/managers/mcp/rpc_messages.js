import { mergeHeaders, mergeHttpTransportHeaders } from './transport.js';
import { clearListCache } from './tool_listing.js';
import { STREAMABLE_HTTP_ACCEPT } from './streamable_http.js';

export function handleIncomingRpcMessage(conn, msg, resolvePendingRpcMessage) {
    if (msg && typeof msg === 'object' && typeof msg.method === 'string') {
        handleServerMethod(conn, msg);
        return;
    }

    resolvePendingRpcMessage(conn, msg);
}

export function sendNotification(conn, method, params) {
    sendJsonRpcMessage(conn, { jsonrpc: '2.0', method, params: params || {} });
}

export function terminateStreamableHttpSession(conn) {
    if (
        conn.transport !== 'streamable-http' ||
        !conn.httpPostUrl ||
        !conn.sessionId ||
        typeof fetch !== 'function'
    ) {
        return;
    }

    fetch(conn.httpPostUrl, {
        method: 'DELETE',
        headers: mergeHttpTransportHeaders(conn, { Accept: STREAMABLE_HTTP_ACCEPT }),
    }).catch(() => {});
}

function handleServerMethod(conn, msg) {
    switch (msg.method) {
        case 'ping':
            if (msg.id !== undefined) sendJsonRpcResponse(conn, msg.id, {});
            break;
        case 'notifications/tools/list_changed':
            clearListCache(conn, 'tools');
            break;
        case 'notifications/prompts/list_changed':
            clearListCache(conn, 'prompts');
            break;
        case 'notifications/resources/list_changed':
            clearListCache(conn, 'resources');
            clearListCache(conn, 'resourceTemplates');
            break;
        default:
            if (msg.id !== undefined) {
                sendJsonRpcError(conn, msg.id, -32601, `Unsupported MCP method: ${msg.method}`);
            }
    }
}

function sendJsonRpcResponse(conn, id, result) {
    sendJsonRpcMessage(conn, { jsonrpc: '2.0', id, result });
}

function sendJsonRpcError(conn, id, code, message) {
    sendJsonRpcMessage(conn, { jsonrpc: '2.0', id, error: { code, message } });
}

function sendJsonRpcMessage(conn, msg) {
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
                Accept: STREAMABLE_HTTP_ACCEPT,
            }),
            body: JSON.stringify(msg),
        }).catch(() => {});
    }
}
