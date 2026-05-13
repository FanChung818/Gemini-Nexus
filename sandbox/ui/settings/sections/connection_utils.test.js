import { describe, expect, it } from 'vitest';
import {
    formatMcpHeaders,
    inferMcpTransport,
    normalizeMcpHeaders,
    normalizeOpenAISettings,
    parseMcpHeadersText,
} from './connection_utils.js';

describe('connection settings utilities', () => {
    it('normalizes MCP headers to trimmed string key-value pairs', () => {
        expect(
            normalizeMcpHeaders({
                ' Authorization ': ' Bearer token ',
                Empty: ' ',
                Missing: null,
            })
        ).toEqual({
            Authorization: 'Bearer token',
        });
    });

    it('formats and parses MCP header JSON', () => {
        const formatted = formatMcpHeaders({ Authorization: 'Bearer token' });

        expect(formatted).toBe('{\n  "Authorization": "Bearer token"\n}');
        expect(parseMcpHeadersText(formatted)).toEqual({ Authorization: 'Bearer token' });
        expect(parseMcpHeadersText('')).toEqual({});
        expect(() => parseMcpHeadersText('[]')).toThrow('Request headers must be a JSON object.');
    });

    it('normalizes legacy OpenAI web-search settings', () => {
        expect(normalizeOpenAISettings({ openaiWebSearchMode: 'responses' })).toEqual({
            useResponsesApi: true,
            webSearch: true,
        });
        expect(
            normalizeOpenAISettings({ openaiUseResponsesApi: false, openaiWebSearch: true })
        ).toEqual({
            useResponsesApi: false,
            webSearch: true,
        });
    });

    it('infers MCP transport from legacy names and URL shape', () => {
        expect(inferMcpTransport('streamablehttp', 'http://127.0.0.1:3006/mcp')).toBe(
            'streamable-http'
        );
        expect(inferMcpTransport('websocket', 'ws://127.0.0.1:3006/mcp')).toBe('ws');
        expect(inferMcpTransport('sse', 'http://127.0.0.1:3006/mcp')).toBe('streamable-http');
        expect(inferMcpTransport('sse', 'http://127.0.0.1:3006/sse')).toBe('sse');
    });
});
