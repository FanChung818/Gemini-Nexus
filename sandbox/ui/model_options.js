import {
    DEFAULT_OFFICIAL_MODEL,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_PROVIDER,
} from '../../shared/config/constants.js';

export function getModelProvider(settings) {
    return settings.provider || (settings.useOfficialApi === true ? 'official' : DEFAULT_PROVIDER);
}

function parseConfiguredModels(rawModels) {
    return String(rawModels || '')
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean);
}

export function createModelOptions(settings) {
    const provider = getModelProvider(settings);

    if (provider === 'official') {
        const models = parseConfiguredModels(settings.officialModel);
        return models.length > 0
            ? models.map((model) => ({ val: model, txt: model }))
            : [{ val: DEFAULT_OFFICIAL_MODEL, txt: DEFAULT_OFFICIAL_MODEL }];
    }

    if (provider === 'openai') {
        const models = parseConfiguredModels(settings.openaiModel);
        return models.length > 0
            ? models.map((model) => ({ val: model, txt: model }))
            : [{ val: DEFAULT_OPENAI_MODEL, txt: 'Custom Model' }];
    }

    return [
        { val: 'gemini-3-flash', txt: 'Fast' },
        { val: 'gemini-3-flash-thinking', txt: 'Thinking' },
        { val: 'gemini-3-pro', txt: '3 Pro' },
    ];
}

export function getPreferredModel(settings, currentValue) {
    const provider = getModelProvider(settings);
    if (provider === 'openai') {
        return settings.openaiSelectedModel || settings.selectedModel || currentValue;
    }
    return settings.selectedModel || currentValue;
}
