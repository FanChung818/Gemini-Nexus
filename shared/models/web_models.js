export const DEFAULT_WEB_MODEL = 'gemini-3-flash';
export const WEB_IMAGE_GENERATION_MODEL = 'gemini-3-pro-image-preview-11-2025';

const WEB_MODEL_OPTIONS = [
    { value: 'gemini-3-flash', label: 'Fast' },
    { value: 'gemini-3-flash-thinking', label: 'Thinking' },
    { value: 'gemini-3-pro', label: '3.1 Pro' },
    { value: 'gemini-3.1-flash-image-preview', label: 'Image Fast' },
    { value: 'gemini-3-pro-image-preview-11-2025', label: 'Image Pro' },
];

const LEGACY_WEB_MODEL_ALIASES = {
    'gemini-2.5-flash': DEFAULT_WEB_MODEL,
};

const WEB_MODEL_HEADER_CONFIGS = {
    'gemini-3-flash': {
        hash: 'fbb127bbb056c959',
        mode: 1,
        featureMode: 1,
    },
    'gemini-3-flash-thinking': {
        hash: 'e051ce1aa80aa576',
        mode: 2,
        featureMode: 5,
    },
    'gemini-3-pro': {
        hash: '9d8ca3786ebdfbea',
        mode: 2,
        featureMode: 1,
    },
    'gemini-3.1-flash-image-preview': {
        hash: 'fbb127bbb056c959',
        mode: 1,
        featureMode: 14,
    },
    'gemini-3-pro-image-preview-11-2025': {
        hash: '56fdd199312815e2',
        mode: 2,
        featureMode: 14,
    },
};

function normalizeWebModel(model) {
    const normalized = String(model || DEFAULT_WEB_MODEL).trim();
    return LEGACY_WEB_MODEL_ALIASES[normalized] || normalized;
}

export function createWebModelOptions() {
    return WEB_MODEL_OPTIONS.map((option) => ({ ...option }));
}

export function createWebModelOptionMarkup() {
    return WEB_MODEL_OPTIONS.map(
        (option) => `<option value="${option.value}">${option.label}</option>`
    ).join('');
}

export function getWebModelHeaderConfig(model) {
    const normalized = normalizeWebModel(model);
    const config = WEB_MODEL_HEADER_CONFIGS[normalized];
    return config ? { ...config } : null;
}

export function getSupportedWebModelValues() {
    return Object.keys(WEB_MODEL_HEADER_CONFIGS);
}
