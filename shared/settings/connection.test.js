import { describe, expect, it } from 'vitest';
import {
    CONNECTION_STORAGE_KEYS,
    createConnectionSettingsPayload,
    createDefaultMcpServer,
    getConnectionProvider,
    getDefaultMcpUrlForTransport,
    getSelectedModelForProvider,
} from './connection.js';

describe('connection settings helpers', () => {
    it('builds the default connection payload used by sidepanel restore messages', () => {
        expect(createConnectionSettingsPayload({})).toEqual({
            provider: 'web',
            useOfficialApi: false,
            selectedModel: 'gemini-2.5-flash',
            openaiSelectedModel: '',
            officialBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            apiKey: '',
            officialModel: 'gemini-3-flash-preview, gemini-3-pro-preview',
            thinkingLevel: 'low',
            officialWebSearch: false,
            openaiBaseUrl: '',
            openaiApiKey: '',
            openaiModel: '',
            openaiThinkingLevel: 'low',
            openaiUseResponsesApi: false,
            openaiWebSearch: false,
            mcpEnabled: false,
            mcpTransport: 'sse',
            mcpServerUrl: 'http://127.0.0.1:3006/sse',
            mcpServers: null,
            mcpActiveServerId: null,
        });
    });

    it('preserves OpenAI-specific selected model and legacy web-search fallback behavior', () => {
        const payload = createConnectionSettingsPayload(
            {
                geminiProvider: 'openai',
                geminiModel: 'gemini-3-flash',
                geminiOpenaiSelectedModel: 'gpt-5',
                geminiOpenaiModel: 'gpt-4.1, gpt-5',
                openaiWebSearchMode: 'chat',
            },
            { includeLegacyFallbacks: true }
        );

        expect(payload.provider).toBe('openai');
        expect(payload.selectedModel).toBe('gpt-5');
        expect(payload.openaiModel).toBe('gpt-4.1, gpt-5');
        expect(payload.openaiUseResponsesApi).toBe(false);
        expect(payload.openaiWebSearch).toBe(true);
    });

    it('normalizes provider and selected model fallback values', () => {
        expect(getConnectionProvider({ geminiUseOfficialApi: true })).toBe('official');
        expect(getConnectionProvider({})).toBe('web');
        expect(getSelectedModelForProvider({}, 'openai')).toBe('openai_custom');
        expect(getSelectedModelForProvider({}, 'web')).toBe('gemini-2.5-flash');
    });

    it('declares the storage keys needed for connection restore', () => {
        expect(CONNECTION_STORAGE_KEYS).toContain('geminiProvider');
        expect(CONNECTION_STORAGE_KEYS).toContain('geminiModel');
        expect(CONNECTION_STORAGE_KEYS).toContain('geminiOpenaiSelectedModel');
        expect(CONNECTION_STORAGE_KEYS).toContain('geminiMcpServers');
    });

    it('creates default MCP server data and transport-specific URLs', () => {
        expect(createDefaultMcpServer('srv_test')).toEqual({
            id: 'srv_test',
            name: 'Local Proxy',
            transport: 'sse',
            url: 'http://127.0.0.1:3006/sse',
            headers: {},
            enabled: true,
            toolMode: 'all',
            enabledTools: [],
        });
        expect(getDefaultMcpUrlForTransport('ws')).toBe('ws://127.0.0.1:3006/mcp');
        expect(getDefaultMcpUrlForTransport('streamable-http')).toBe('http://127.0.0.1:3006/mcp');
        expect(getDefaultMcpUrlForTransport('sse')).toBe('http://127.0.0.1:3006/sse');
    });
});
