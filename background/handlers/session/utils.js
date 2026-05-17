import { debugLog } from '../../../shared/logging/debug.js';

export { parseToolCommand, splitToolCallFromText } from '../../../shared/text/tool_call_text.js';

export function hasNativeFunctionCalls(result) {
    return (
        Array.isArray(result?.functionCalls) &&
        result.functionCalls.some(
            (call) => call && typeof call.name === 'string' && call.name.trim()
        )
    );
}

function createOfficialFunctionResponsePart(toolResult) {
    const name = typeof toolResult?.toolName === 'string' ? toolResult.toolName : '';
    if (!name) return null;

    const functionResponse = {
        name,
        response: {
            output: toolResult?.output ?? '',
            status: toolResult?.status || 'completed',
        },
    };

    if (toolResult?.id) {
        functionResponse.id = toolResult.id;
    }

    return { functionResponse };
}

export function createOfficialFunctionResponseParts(toolResults) {
    if (!Array.isArray(toolResults)) return [];
    return toolResults.map(createOfficialFunctionResponsePart).filter(Boolean);
}

export function createOfficialFunctionResponseMessage(toolResults) {
    const parts = createOfficialFunctionResponseParts(toolResults);
    if (parts.length === 0) return null;

    return {
        role: 'user',
        text: '',
        officialContent: {
            role: 'user',
            parts,
        },
    };
}

export function createOfficialModelMessage(result) {
    if (!result?.officialContent || !Array.isArray(result.officialContent.parts)) {
        return null;
    }

    return {
        role: 'ai',
        text: result.text || '',
        thoughts: result.thoughts || null,
        thoughtsDurationSeconds: result.thoughtsDurationSeconds,
        sources: result.sources || null,
        generatedImages: result.images,
        thoughtSignature: result.thoughtSignature,
        officialContent: result.officialContent,
    };
}

export async function getActiveTabContent(specificTabId = null) {
    try {
        let tab;
        if (specificTabId) {
            try {
                tab = await chrome.tabs.get(specificTabId);
            } catch {
                return null;
            }
        } else {
            const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            tab = tabs[0];
        }

        if (!tab || !tab.id) return null;

        if (
            tab.url &&
            (tab.url.startsWith('chrome://') ||
                tab.url.startsWith('edge://') ||
                tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('about:') ||
                tab.url.startsWith('view-source:') ||
                tab.url.startsWith('https://chrome.google.com/webstore') ||
                tab.url.startsWith('https://chromewebstore.google.com'))
        ) {
            return null;
        }

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_CONTENT' });
            return response ? response.content : null;
        } catch {
            debugLog('Content script unavailable, attempting fallback injection...');
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => (document.body ? document.body.innerText : ''),
                });
                return results?.[0]?.result || null;
            } catch (injectionError) {
                console.error('Fallback injection failed:', injectionError);
                return null;
            }
        }
    } catch (error) {
        console.error('Failed to get page context:', error);
        return null;
    }
}
