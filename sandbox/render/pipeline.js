import { MathHandler } from './math_utils.js';

const ALLOWED_TAGS = new Set([
    'a',
    'blockquote',
    'br',
    'button',
    'code',
    'del',
    'details',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'img',
    'input',
    'kbd',
    'li',
    'ol',
    'p',
    'pre',
    's',
    'span',
    'strong',
    'sub',
    'summary',
    'sup',
    'svg',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
    'path',
    'polyline',
    'rect',
]);

const GLOBAL_ATTRS = new Set(['aria-hidden', 'aria-label', 'class', 'hidden', 'id', 'title']);

const TAG_ATTRS = {
    a: new Set(['href', 'target', 'rel']),
    button: new Set(['type']),
    code: new Set(['class']),
    img: new Set(['alt', 'src', 'title']),
    input: new Set(['checked', 'disabled', 'type']),
    path: new Set(['d']),
    polyline: new Set(['points']),
    rect: new Set(['height', 'rx', 'ry', 'width', 'x', 'y']),
    span: new Set(['data-line']),
    svg: new Set([
        'fill',
        'height',
        'stroke',
        'stroke-linecap',
        'stroke-linejoin',
        'stroke-width',
        'viewbox',
        'width',
        'xmlns',
    ]),
    th: new Set(['align']),
    td: new Set(['align']),
};

const URI_ATTRS = new Set(['href', 'src']);
const SAFE_URI_PATTERN =
    /^(https?:|data:image\/(?:png|gif|jpe?g|webp|svg\+xml);base64,|blob:|#|\/)/i;

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function isAllowedAttribute(tagName, attrName) {
    if (attrName.startsWith('on')) return false;
    if (attrName.startsWith('data-')) return true;
    return GLOBAL_ATTRS.has(attrName) || TAG_ATTRS[tagName]?.has(attrName) === true;
}

function isSafeAttributeValue(attrName, value) {
    if (!URI_ATTRS.has(attrName)) return true;
    return SAFE_URI_PATTERN.test(String(value || '').trim());
}

function sanitizeElement(element) {
    const tagName = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
        element.remove();
        return;
    }

    Array.from(element.attributes).forEach((attr) => {
        const attrName = attr.name.toLowerCase();
        if (!isAllowedAttribute(tagName, attrName) || !isSafeAttributeValue(attrName, attr.value)) {
            element.removeAttribute(attr.name);
        }
    });

    if (tagName === 'a' && element.getAttribute('target') === '_blank') {
        element.setAttribute('rel', 'noopener noreferrer');
    }
}

function sanitizeHtml(html) {
    if (typeof document === 'undefined') return escapeHtml(html);

    const template = document.createElement('template');
    template.innerHTML = html || '';
    Array.from(template.content.querySelectorAll('*')).forEach(sanitizeElement);
    return template.innerHTML;
}

/**
 * Transforms raw text into HTML with Math placeholders protected/restored.
 * @param {string} text - Raw Markdown text
 * @returns {string} - HTML string
 */
export function transformMarkdown(text) {
    if (typeof marked === 'undefined') {
        // Library loads asynchronously; app will rerender when ready.
        // Return raw text in the meantime without polluting console.
        return escapeHtml(text);
    }

    const mathHandler = new MathHandler();

    let processedText = mathHandler.protect(text || '');

    let html = marked.parse(processedText);

    html = mathHandler.restore(html);

    return sanitizeHtml(html);
}
