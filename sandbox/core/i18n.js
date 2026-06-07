import { translations } from './translations.js';

function resolveLanguage(pref) {
    if (pref === 'system') {
        const language = navigator.language.toLowerCase();
        if (language === 'zh-tw' || language === 'zh-hk' || language === 'zh-mo') {
            return 'zhTW';
        }
        return language.startsWith('zh') ? 'zh' : 'en';
    }
    if (pref === 'zh-TW') return 'zhTW';
    return pref;
}

let savedPreference = 'system';
let currentLang = resolveLanguage(savedPreference);

// Apply initial lang attribute for CSS/DOM consistency
try {
    document.documentElement.lang = currentLang;
} catch {}

export function setLanguagePreference(pref) {
    savedPreference = pref;
    currentLang = resolveLanguage(pref);
    document.documentElement.lang = currentLang;
}

export function getLanguagePreference() {
    return savedPreference;
}

export function t(key) {
    return translations[currentLang][key] || key;
}

export function formatT(key, values = {}) {
    return t(key).replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
    );
}

export function applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((element) => {
        const key = element.getAttribute('data-i18n');
        const text = t(key);
        if (text) element.textContent = text;
    });

    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach((element) => {
        const key = element.getAttribute('data-i18n-placeholder');
        const text = t(key);
        if (text) element.placeholder = text;
    });

    const titles = document.querySelectorAll('[data-i18n-title]');
    titles.forEach((element) => {
        const key = element.getAttribute('data-i18n-title');
        const text = t(key);
        if (text) {
            element.title = text;
            element.setAttribute('aria-label', text);
        }
    });
}
