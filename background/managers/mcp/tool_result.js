// @ts-check

/**
 * @param {unknown} content
 * @returns {string}
 */
function extractTextFromContent(content) {
    if (!Array.isArray(content)) return '';
    return content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('');
}

/**
 * @param {unknown} content
 * @returns {Array<{ base64: string, type: string, name: string }>}
 */
function extractFilesFromContent(content) {
    if (!Array.isArray(content)) return [];
    const files = [];
    for (const part of content) {
        if (!part || part.type !== 'image') continue;
        const mimeType = part.mimeType || 'image/png';
        const data = part.data;
        if (typeof data !== 'string' || data.length === 0) continue;
        const base64 = data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`;
        files.push({
            base64,
            type: mimeType,
            name: `mcp-image-${Date.now()}.${mimeType.includes('png') ? 'png' : 'img'}`,
        });
    }
    return files;
}

/**
 * @param {unknown} result
 * @returns {{ text: string, files: Array<{ base64: string, type: string, name: string }> }}
 */
export function normalizeMcpToolResult(result) {
    if (typeof result === 'string') return { text: result, files: [] };

    if (result && typeof result === 'object') {
        /** @type {Record<string, any>} */
        const objectResult = result;
        if (Array.isArray(objectResult.content)) {
            return {
                text: extractTextFromContent(objectResult.content),
                files: extractFilesFromContent(objectResult.content),
            };
        }

        if (typeof objectResult.text === 'string') return { text: objectResult.text, files: [] };
    }

    try {
        return { text: JSON.stringify(result, null, 2), files: [] };
    } catch {
        return { text: String(result), files: [] };
    }
}

/**
 * @param {unknown} schema
 * @returns {string}
 */
export function summarizeInputSchema(schema) {
    if (!schema || typeof schema !== 'object') return '';
    /** @type {Record<string, any>} */
    const objectSchema = schema;
    const props =
        objectSchema.properties && typeof objectSchema.properties === 'object'
            ? objectSchema.properties
            : {};
    const required = Array.isArray(objectSchema.required) ? objectSchema.required : [];

    const parts = [];
    for (const key of required) {
        const spec = props[key] && typeof props[key] === 'object' ? props[key] : {};
        const type = typeof spec.type === 'string' ? spec.type : 'any';
        parts.push(`${key}: ${type}`);
    }
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
}
