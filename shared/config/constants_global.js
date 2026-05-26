(function () {
    const DEFAULT_SHORTCUTS = Object.freeze({
        quickAsk: 'Ctrl+G',
        openPanel: 'Alt+S',
        browserControl: 'Ctrl+B',
        ocrCapture: 'Alt+O',
    });

    const CONTEXT_RECENT_TURNS_LIMITS = Object.freeze({
        MIN: 1,
        MAX: 50,
        DEFAULT: 10,
    });

    globalThis.GeminiNexusConfig = Object.freeze({
        DEFAULT_SHORTCUTS,
        DEFAULT_PROVIDER: 'web',
        DEFAULT_STORED_GEMINI_MODEL: '8c46e95b1a07cecc',
        DEFAULT_OFFICIAL_MODEL: 'gemini-3-flash-preview',
        DEFAULT_OFFICIAL_MODELS: 'gemini-3-flash-preview, gemini-3.1-pro-preview',
        DEFAULT_OFFICIAL_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
        DEFAULT_OPENAI_MODEL: 'openai_custom',
        DEFAULT_THINKING_LEVEL: 'low',
        DEFAULT_CONTEXT_MODE: 'summary',
        DEFAULT_CONTEXT_RECENT_TURNS: CONTEXT_RECENT_TURNS_LIMITS.DEFAULT,
        CONTEXT_RECENT_TURNS_LIMITS,
        DEFAULT_SIDE_PANEL_SCOPE: 'remembered_tabs',
        DEFAULT_MCP_TRANSPORT: 'streamable-http',
        DEFAULT_MCP_HTTP_URL: 'http://127.0.0.1:3006/mcp',
        DEFAULT_MCP_SSE_URL: 'http://127.0.0.1:3006/sse',
        DEFAULT_MCP_WS_URL: 'ws://127.0.0.1:3006/mcp',
    });
})();
