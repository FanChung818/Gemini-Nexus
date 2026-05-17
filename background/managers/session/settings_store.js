import {
    DEFAULT_CONTEXT_MODE,
    DEFAULT_CONTEXT_RECENT_TURNS,
    DEFAULT_OFFICIAL_BASE_URL,
    DEFAULT_OFFICIAL_MODELS,
    DEFAULT_THINKING_LEVEL,
} from '../../../shared/config/constants.js';
import {
    getConnectionProvider,
    getOpenAIWebSearchStorageKeys,
} from '../../../shared/settings/connection.js';
import { normalizeOpenAIWebSearchSettings } from '../../../shared/settings/openai.js';
import { debugLog } from '../../../shared/logging/debug.js';

export async function getConnectionSettings() {
    const stored = await chrome.storage.local.get([
        'geminiProvider',
        'geminiUseOfficialApi',
        'geminiOfficialBaseUrl',
        'geminiApiKey',
        'geminiOfficialModel',
        'geminiThinkingLevel',
        'geminiOfficialWebSearch',
        'geminiApiKeyPointer',
        'geminiOpenaiBaseUrl',
        'geminiOpenaiApiKey',
        'geminiOpenaiModel',
        'geminiOpenaiThinkingLevel',
        'geminiOpenaiUseResponsesApi',
        'geminiOpenaiWebSearchMode',
        'geminiOpenaiWebSearch',
        'geminiContextMode',
        'geminiContextRecentTurns',
    ]);

    const provider = getConnectionProvider(stored);

    let activeApiKey = stored.geminiApiKey || '';

    // Handle API Key Rotation (Comma separated) for Official Gemini
    if (provider === 'official' && activeApiKey.includes(',')) {
        const keys = activeApiKey
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k);

        if (keys.length > 0) {
            let pointer = stored.geminiApiKeyPointer || 0;

            // Reset pointer if out of bounds (e.g. keys removed)
            if (typeof pointer !== 'number' || pointer >= keys.length || pointer < 0) {
                pointer = 0;
            }

            activeApiKey = keys[pointer];

            // Advance pointer for next call
            const nextPointer = (pointer + 1) % keys.length;
            await chrome.storage.local.set({ geminiApiKeyPointer: nextPointer });

            debugLog(`[Gemini Nexus] Rotating Official API Key (Index: ${pointer})`);
        }
    } else {
        // Trim single key just in case
        activeApiKey = activeApiKey.trim();
    }

    const openaiSettings = normalizeOpenAIWebSearchSettings(
        stored,
        getOpenAIWebSearchStorageKeys()
    );

    return {
        provider: provider,
        // Official
        officialBaseUrl: stored.geminiOfficialBaseUrl || DEFAULT_OFFICIAL_BASE_URL,
        apiKey: activeApiKey,
        officialModel: stored.geminiOfficialModel || DEFAULT_OFFICIAL_MODELS,
        thinkingLevel: stored.geminiThinkingLevel || DEFAULT_THINKING_LEVEL,
        officialWebSearch: stored.geminiOfficialWebSearch === true,
        // OpenAI
        openaiBaseUrl: stored.geminiOpenaiBaseUrl,
        openaiApiKey: stored.geminiOpenaiApiKey,
        openaiModel: stored.geminiOpenaiModel,
        openaiThinkingLevel: stored.geminiOpenaiThinkingLevel || DEFAULT_THINKING_LEVEL,
        openaiUseResponsesApi: openaiSettings.useResponsesApi,
        openaiWebSearch: openaiSettings.webSearch,
        // Context management
        contextMode: stored.geminiContextMode || DEFAULT_CONTEXT_MODE,
        contextRecentTurns: stored.geminiContextRecentTurns || DEFAULT_CONTEXT_RECENT_TURNS,
    };
}
