const OPENAI_WEB_SEARCH_MODES = new Set(['off', 'responses', 'chat']);

export function normalizeMcpHeaders(headers) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};

    const result = {};
    for (const [name, value] of Object.entries(headers)) {
        const key = String(name || '').trim();
        if (!key || value === undefined || value === null) continue;

        const text = String(value).trim();
        if (!text) continue;
        result[key] = text;
    }
    return result;
}

export function formatMcpHeaders(headers) {
    const normalized = normalizeMcpHeaders(headers);
    if (Object.keys(normalized).length === 0) return '';
    return JSON.stringify(normalized, null, 2);
}

export function parseMcpHeadersText(text) {
    const raw = (text || '').trim();
    if (!raw) return {};

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Request headers must be valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Request headers must be a JSON object.');
    }

    return normalizeMcpHeaders(parsed);
}

export function normalizeOpenAISettings(data) {
    const hasUseResponsesSetting = typeof data.openaiUseResponsesApi === 'boolean';
    const hasWebSearchSetting = typeof data.openaiWebSearch === 'boolean';

    if (!hasUseResponsesSetting && OPENAI_WEB_SEARCH_MODES.has(data.openaiWebSearchMode)) {
        return {
            useResponsesApi: data.openaiWebSearchMode === 'responses',
            webSearch:
                data.openaiWebSearchMode === 'responses' || data.openaiWebSearchMode === 'chat',
        };
    }

    return {
        useResponsesApi: data.openaiUseResponsesApi === true,
        webSearch: hasWebSearchSetting ? data.openaiWebSearch === true : false,
    };
}

export function inferMcpTransport(transport, url) {
    const normalized = (transport || 'sse').toLowerCase();
    if (normalized === 'streamablehttp') return 'streamable-http';
    if (normalized === 'websocket') return 'ws';

    if (normalized === 'sse' && typeof url === 'string') {
        try {
            const parsed = new URL(url.trim());
            const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
            if (parsed.protocol.startsWith('http') && !path.endsWith('/sse')) {
                return 'streamable-http';
            }
        } catch {}
    }

    return normalized;
}
