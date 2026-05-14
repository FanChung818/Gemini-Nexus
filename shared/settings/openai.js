const OPENAI_WEB_SEARCH_MODES = new Set(['off', 'responses', 'chat']);

function hasBoolean(data, key) {
    if (!key) return false;
    return typeof data?.[key] === 'boolean';
}

function isEnabled(data, key) {
    if (!key) return false;
    return data?.[key] === true;
}

export function normalizeOpenAIWebSearchSettings(data, keys = {}) {
    const {
        useResponsesApiKey = 'openaiUseResponsesApi',
        webSearchKey = 'openaiWebSearch',
        webSearchModeKey = 'openaiWebSearchMode',
        fallbackUseResponsesApiKey = null,
        fallbackWebSearchKey = null,
        fallbackWebSearchModeKey = null,
    } = keys;

    const legacyMode = data?.[webSearchModeKey] ?? data?.[fallbackWebSearchModeKey];
    const hasUseResponsesSetting =
        hasBoolean(data, useResponsesApiKey) || hasBoolean(data, fallbackUseResponsesApiKey);
    const hasWebSearchSetting =
        hasBoolean(data, webSearchKey) || hasBoolean(data, fallbackWebSearchKey);

    if (!hasUseResponsesSetting && OPENAI_WEB_SEARCH_MODES.has(legacyMode)) {
        return {
            useResponsesApi: legacyMode === 'responses',
            webSearch: legacyMode === 'responses' || legacyMode === 'chat',
        };
    }

    return {
        useResponsesApi:
            isEnabled(data, useResponsesApiKey) || isEnabled(data, fallbackUseResponsesApiKey),
        webSearch: hasWebSearchSetting
            ? isEnabled(data, webSearchKey) || isEnabled(data, fallbackWebSearchKey)
            : false,
    };
}
