import { createPrefixedId } from '../../shared/utils/index.js';
import { t } from '../core/i18n.js';

const HTML_LANGUAGES = new Set(['html', 'htm', 'xhtml']);
const SVG_LANGUAGES = new Set(['svg']);
const MERMAID_LANGUAGES = new Set(['mermaid', 'mmd']);
const GRAPHVIZ_LANGUAGES = new Set(['graphviz', 'dot']);
const TEXT_LANGUAGES = new Set(['', 'plaintext', 'text', 'txt']);
const DANGEROUS_TAGS = new Set([
    'applet',
    'base',
    'embed',
    'iframe',
    'link',
    'meta',
    'object',
    'script',
]);
const BLOCKED_ATTRS = new Set(['srcdoc']);
const URI_ATTRS = new Set([
    'action',
    'background',
    'cite',
    'formaction',
    'href',
    'poster',
    'src',
    'xlink:href',
]);

let mermaidLoader = () => import('mermaid');
let mermaidModulePromise = null;
let graphvizLoader = () => import('@viz-js/viz');
let graphvizInstancePromise = null;
const graphvizCache = new Map();

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeLanguage(language) {
    return String(language || '')
        .trim()
        .split(/\s+/)[0]
        .toLowerCase();
}

function getCodeLanguage(wrapper) {
    const dataLang = wrapper.dataset?.codeLang;
    if (dataLang) return dataLang;

    const labelLang = wrapper.querySelector('.code-lang')?.textContent;
    if (labelLang) return labelLang;

    const code = wrapper.querySelector('pre code');
    const languageClass = Array.from(code?.classList || []).find((className) =>
        className.startsWith('language-')
    );
    return languageClass ? languageClass.slice('language-'.length) : '';
}

function looksLikeSvg(code) {
    return /^\s*<svg(?:\s|>)/i.test(code);
}

function looksLikeHtml(code) {
    return /^\s*(?:<!doctype\s+html|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|<(?:article|button|canvas|div|form|main|section|style|table)(?:\s|>))/i.test(
        code
    );
}

function stripMermaidComments(code) {
    return String(code || '')
        .replace(/^(?:\s*%%[^\n]*(?:\n|$))+/, '')
        .trim();
}

function looksLikeMermaid(code) {
    return /^(?:c4component|c4container|c4context|classdiagram|erdiagram|flowchart|gantt|gitgraph|graph|journey|mindmap|pie|quadrantchart|requirementdiagram|sequencediagram|statediagram(?:-v2)?|timeline)\b/i.test(
        stripMermaidComments(code)
    );
}

function looksLikeGraphviz(code) {
    return /^\s*(?:strict\s+)?(?:di)?graph(?:\s+[\w\d_"]+)?\s*\{/i.test(code);
}

export function getArtifactKind(language, code = '') {
    const normalizedLanguage = normalizeLanguage(language);
    const trimmedCode = String(code || '').trim();

    if (HTML_LANGUAGES.has(normalizedLanguage)) return 'html';
    if (SVG_LANGUAGES.has(normalizedLanguage)) return 'svg';
    if (MERMAID_LANGUAGES.has(normalizedLanguage)) return 'mermaid';
    if (GRAPHVIZ_LANGUAGES.has(normalizedLanguage)) return 'graphviz';
    if (looksLikeSvg(trimmedCode)) return 'svg';

    if (TEXT_LANGUAGES.has(normalizedLanguage)) {
        if (looksLikeHtml(trimmedCode)) return 'html';
        if (looksLikeMermaid(trimmedCode)) return 'mermaid';
        if (looksLikeGraphviz(trimmedCode)) return 'graphviz';
    }

    return null;
}

function isSafePreviewUrl(value) {
    const normalized = String(value || '')
        .replace(/[\u0000-\u001f\u007f]+/g, '')
        .trim();

    if (!normalized || normalized.startsWith('#')) return true;
    return /^data:image\/(?:gif|jpe?g|png|svg\+xml|webp);base64,/i.test(normalized);
}

function sanitizeCssText(cssText) {
    return String(cssText || '')
        .replace(/@import\s+[^;]+;?/gi, '')
        .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote, url) =>
            isSafePreviewUrl(url) ? match : ''
        )
        .replace(/expression\s*\([^)]*\)/gi, '')
        .replace(/-moz-binding\s*:[^;]+;?/gi, '')
        .replace(/javascript\s*:/gi, '');
}

function sanitizePreviewElement(element, kind) {
    const tagName = element.tagName.toLowerCase();
    if (DANGEROUS_TAGS.has(tagName) || (kind === 'svg' && tagName === 'foreignobject')) {
        element.remove();
        return;
    }

    Array.from(element.attributes || []).forEach((attr) => {
        const attrName = attr.name.toLowerCase();
        if (attrName.startsWith('on') || BLOCKED_ATTRS.has(attrName)) {
            element.removeAttribute(attr.name);
            return;
        }

        if (URI_ATTRS.has(attrName) && !isSafePreviewUrl(attr.value)) {
            element.removeAttribute(attr.name);
            return;
        }

        if (attrName === 'style') {
            const sanitizedStyle = sanitizeCssText(attr.value);
            if (sanitizedStyle.trim()) {
                element.setAttribute(attr.name, sanitizedStyle);
            } else {
                element.removeAttribute(attr.name);
            }
        }
    });

    if (tagName === 'style') {
        element.textContent = sanitizeCssText(element.textContent || '');
    }
}

function sanitizePreviewContainer(container, kind) {
    Array.from(container.querySelectorAll('*')).forEach((element) =>
        sanitizePreviewElement(element, kind)
    );
}

export function sanitizeArtifactMarkup(markup, kind = 'html') {
    if (typeof document === 'undefined') return escapeHtml(markup);

    const source = String(markup || '');
    if (kind === 'html') {
        const parsed = new DOMParser().parseFromString(source, 'text/html');
        sanitizePreviewContainer(parsed, 'html');

        const styleHtml = Array.from(parsed.head.querySelectorAll('style'))
            .map((style) => style.outerHTML)
            .join('');
        return `${styleHtml}${parsed.body.innerHTML}`.trim();
    }

    const template = document.createElement('template');
    template.innerHTML = source;
    sanitizePreviewContainer(template.content, 'svg');
    const svg = template.content.querySelector('svg');
    return svg ? svg.outerHTML : template.innerHTML.trim();
}

export function buildArtifactSrcDoc(kind, code) {
    const sanitizedMarkup = sanitizeArtifactMarkup(code, kind);
    const bodyClass = kind === 'svg' ? 'artifact-svg' : 'artifact-html';

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<style>
html,body{min-height:100%;margin:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{box-sizing:border-box;overflow:auto}
body.artifact-html{padding:16px}
body.artifact-svg{display:grid;place-items:center;padding:16px}
*,*::before,*::after{box-sizing:border-box}
img,svg,canvas,video{max-width:100%}
svg{height:auto}
</style>
</head>
<body class="${bodyClass}">${sanitizedMarkup}</body>
</html>`;
}

async function loadMermaidModule() {
    if (!mermaidModulePromise) {
        mermaidModulePromise = mermaidLoader().then((module) => module.default || module);
    }
    return mermaidModulePromise;
}

async function loadGraphvizInstance() {
    if (!graphvizInstancePromise) {
        graphvizInstancePromise = graphvizLoader()
            .then((module) => {
                const createInstance = module.instance || module.default?.instance;
                if (typeof createInstance !== 'function') {
                    throw new Error(t('liveArtifactPreviewFailed'));
                }
                return createInstance();
            })
            .catch((error) => {
                graphvizInstancePromise = null;
                throw error;
            });
    }
    return graphvizInstancePromise;
}

async function renderMermaidToSvg(code) {
    const mermaid = await loadMermaidModule();
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
        fontFamily: 'inherit',
        flowchart: {
            htmlLabels: false,
            useMaxWidth: true,
        },
    });

    if (typeof mermaid.parse === 'function') {
        const parseResult = await mermaid.parse(code, { suppressErrors: false });
        if (parseResult === false) {
            throw new Error(t('liveArtifactPreviewFailed'));
        }
    }

    const result = await mermaid.render(createPrefixedId('mermaid_svg'), code);
    return result?.svg || '';
}

function isMermaidErrorSvg(svg) {
    const text = String(svg || '').toLowerCase();
    return (
        /class=["'][^"']*error-icon/i.test(svg) ||
        (text.includes('syntax error in text') && text.includes('mermaid version'))
    );
}

function getGraphvizThemeKey() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function getGraphvizLayoutDirection(code) {
    const match = String(code || '').match(/rankdir\s*=\s*(["']?)(LR|TB|RL|BT)\1/i);
    if (!match) return 'LR';

    const direction = match[2].toUpperCase();
    if (direction === 'TB' || direction === 'BT') return 'TB';
    return 'LR';
}

function prepareGraphvizCode(code, themeKey = getGraphvizThemeKey()) {
    let processedCode = String(code || '');
    const effectiveLayout = getGraphvizLayoutDirection(processedCode);
    const rankdirRegex = /(rankdir\s*=\s*)(["']?)(LR|TB|RL|BT)\2/gi;

    if (rankdirRegex.test(processedCode)) {
        processedCode = processedCode.replace(rankdirRegex, `$1"${effectiveLayout}"`);
    } else {
        const graphMatch = processedCode.match(
            /(\s*(?:strict\s+)?(?:di)?graph\s+[\w\d_"]*\s*\{|\s*(?:strict\s+)?(?:di)?graph\s*\{)/i
        );
        if (graphMatch) {
            processedCode = processedCode.replace(
                graphMatch[0],
                `${graphMatch[0]}\n  rankdir="${effectiveLayout}";`
            );
        }
    }

    const color = themeKey === 'dark' ? '#e4e4e7' : '#374151';
    const themeDefaults = `
        graph [bgcolor="transparent" fontcolor="${color}" margin="0"];
        node [color="${color}" fontcolor="${color}"];
        edge [color="${color}" fontcolor="${color}"];
      `;

    const openBraceIndex = processedCode.indexOf('{');
    if (openBraceIndex !== -1) {
        processedCode =
            processedCode.slice(0, openBraceIndex + 1) +
            themeDefaults +
            processedCode.slice(openBraceIndex + 1);
    }

    return {
        code: processedCode,
        layout: effectiveLayout,
        theme: themeKey,
    };
}

async function renderGraphvizToSvg(code) {
    const source = String(code || '');
    if (!source.trim()) return '';

    const prepared = prepareGraphvizCode(source);
    const cacheKey = `${prepared.theme}::${prepared.layout}::${source}`;
    if (graphvizCache.has(cacheKey)) return graphvizCache.get(cacheKey);

    const vizInstance = await loadGraphvizInstance();
    const svgElement = await vizInstance.renderSVGElement(prepared.code);
    svgElement.style.maxWidth = '100%';
    svgElement.style.height = 'auto';
    svgElement.style.display = 'block';

    const svg = svgElement.outerHTML;
    graphvizCache.set(cacheKey, svg);
    return svg;
}

function setPreviewLoading(body) {
    body.classList.remove('live-artifact-body-error');
    body.classList.add('live-artifact-body-loading');
    body.setAttribute('aria-busy', 'true');
    body.textContent = t('liveArtifactRendering');
}

function setPreviewError(body, message) {
    body.classList.remove('live-artifact-body-loading');
    body.classList.add('live-artifact-body-error');
    body.removeAttribute('aria-busy');
    body.innerHTML = '';

    const error = document.createElement('div');
    error.className = 'live-artifact-error';
    error.textContent = message || t('liveArtifactPreviewFailed');
    body.appendChild(error);
}

function setPreviewSvg(body, svg) {
    body.classList.remove('live-artifact-body-loading', 'live-artifact-body-error');
    body.removeAttribute('aria-busy');
    body.innerHTML = svg;
}

function renderMermaidPreview(body, code, renderMermaid = renderMermaidToSvg, options = {}) {
    const deferErrors = options.deferErrors === true;
    setPreviewLoading(body);

    Promise.resolve(renderMermaid(code))
        .then((svg) => {
            if (!body.isConnected) return;
            if (isMermaidErrorSvg(svg)) {
                throw new Error(t('liveArtifactPreviewFailed'));
            }

            const sanitizedSvg = sanitizeArtifactMarkup(svg, 'svg');
            if (!sanitizedSvg) {
                setPreviewError(body, t('liveArtifactPreviewFailed'));
                return;
            }

            setPreviewSvg(body, sanitizedSvg);
        })
        .catch((error) => {
            if (!body.isConnected) return;
            if (deferErrors) {
                setPreviewLoading(body);
                return;
            }

            const errorMessage = error instanceof Error ? error.message : '';
            setPreviewError(body, errorMessage || t('liveArtifactPreviewFailed'));
        });
}

function formatGraphvizErrorMessage(error) {
    const message = error instanceof Error ? error.message : '';
    return message.replace(/.*error:\s*/i, '') || t('liveArtifactPreviewFailed');
}

function renderGraphvizPreview(body, code, renderGraphviz = renderGraphvizToSvg, options = {}) {
    const deferErrors = options.deferErrors === true;
    setPreviewLoading(body);

    Promise.resolve(renderGraphviz(code))
        .then((svg) => {
            if (!body.isConnected) return;
            const sanitizedSvg = sanitizeArtifactMarkup(svg, 'svg');
            if (!sanitizedSvg && String(code || '').trim()) {
                setPreviewError(body, t('liveArtifactPreviewFailed'));
                return;
            }

            setPreviewSvg(body, sanitizedSvg);
        })
        .catch((error) => {
            if (!body.isConnected) return;
            if (deferErrors) {
                setPreviewLoading(body);
                return;
            }

            setPreviewError(body, formatGraphvizErrorMessage(error));
        });
}

export function createLiveArtifactPreview(kind, code, options = {}) {
    const preview = document.createElement('section');
    preview.className = 'live-artifact-preview';
    preview.dataset.liveArtifactKind = kind;

    const header = document.createElement('div');
    header.className = 'live-artifact-header';

    const title = document.createElement('span');
    title.className = 'live-artifact-title';
    title.textContent = t('liveArtifactPreview');

    const badge = document.createElement('span');
    badge.className = 'live-artifact-badge';
    badge.textContent = kind.toUpperCase();

    header.appendChild(title);
    header.appendChild(badge);
    preview.appendChild(header);

    const body = document.createElement('div');
    body.className = `live-artifact-body live-artifact-body-${kind}`;
    preview.appendChild(body);

    if (kind === 'mermaid') {
        renderMermaidPreview(body, code, options.renderMermaid, {
            deferErrors: options.deferMermaidErrors === true,
        });
        return preview;
    }

    if (kind === 'graphviz') {
        renderGraphvizPreview(body, code, options.renderGraphviz, {
            deferErrors: options.deferGraphvizErrors === true,
        });
        return preview;
    }

    const frame = document.createElement('iframe');
    frame.className = 'live-artifact-frame';
    frame.title = `${t('liveArtifactPreviewTitle')} (${kind.toUpperCase()})`;
    frame.setAttribute('sandbox', '');
    frame.referrerPolicy = 'no-referrer';
    frame.loading = 'lazy';
    frame.srcdoc = buildArtifactSrcDoc(kind, code);
    body.appendChild(frame);

    return preview;
}

export function enhanceLiveArtifacts(root, options = {}) {
    if (!root || typeof document === 'undefined') return;

    const wrappers = root.matches?.('.code-block-wrapper')
        ? [root]
        : Array.from(root.querySelectorAll?.('.code-block-wrapper') || []);

    wrappers.forEach((wrapper) => {
        if (wrapper.dataset.liveArtifactEnhanced === 'true') return;

        const codeElement = wrapper.querySelector('pre code');
        const code = codeElement?.textContent || '';
        const kind = getArtifactKind(getCodeLanguage(wrapper), code);
        if (!kind) return;

        wrapper.dataset.liveArtifactEnhanced = 'true';
        wrapper.appendChild(createLiveArtifactPreview(kind, code, options));
    });
}

export function setMermaidLoaderForTest(loader) {
    mermaidLoader = typeof loader === 'function' ? loader : () => import('mermaid');
    mermaidModulePromise = null;
}

export function setGraphvizLoaderForTest(loader) {
    graphvizLoader = typeof loader === 'function' ? loader : () => import('@viz-js/viz');
    graphvizInstancePromise = null;
    graphvizCache.clear();
}
