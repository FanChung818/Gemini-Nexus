
// background/handlers/session/utils.js

export function parseToolCommand(responseText) {
    // 1. Try to extract from Markdown code block first (most reliable)
    // Matches ```json { ... } ``` or ``` { ... } ```
    const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (codeBlockMatch) {
        try {
            const cmd = JSON.parse(codeBlockMatch[1]);
            if (cmd.tool && cmd.args) return { name: cmd.tool, args: cmd.args };
        } catch (e) {
            // fall through to fuzzy search
        }
    }

    // 2. Fallback: Robustly scan for a JSON object containing "tool": "..."
    // This handles cases where the model outputs raw JSON without markdown fences,
    // or includes preamble/postscript text.
    
    // Find all occurrences of "tool": to identify potential start points
    const regex = /"tool"\s*:/g;
    let match;
    const indices = [];
    while ((match = regex.exec(responseText)) !== null) {
        indices.push(match.index);
    }
    
    // Iterate backwards from the last occurrence (tools usually appear at the end)
    for (let i = indices.length - 1; i >= 0; i--) {
        const toolIdx = indices[i];
        
        // Find the nearest opening brace '{' before "tool":
        const openBraceIdx = responseText.lastIndexOf('{', toolIdx);
        if (openBraceIdx === -1) continue;
        
        // Extract the substring starting from this brace
        const subStrStart = responseText.substring(openBraceIdx);
        
        // Try to find a valid closing brace '}' that forms valid JSON
        // We search backwards from the end of the string to find the matching closing brace
        let searchEnd = subStrStart.length;
        while (searchEnd > 0) {
            const closeIdx = subStrStart.lastIndexOf('}', searchEnd - 1);
            if (closeIdx === -1) break;
            
            const candidate = subStrStart.substring(0, closeIdx + 1);
            try {
                const cmd = JSON.parse(candidate);
                // Validate structure matches our protocol
                if (cmd.tool && cmd.args) {
                    return {
                        name: cmd.tool,
                        args: cmd.args
                    };
                }
            } catch (e) {
                // Invalid JSON, possibly captured trailing text or incomplete structure
                // Continue shrinking the window to the previous '}'
            }
            searchEnd = closeIdx;
        }
    }

    return null;
}

export function hasNativeFunctionCalls(result) {
    return Array.isArray(result?.functionCalls)
        && result.functionCalls.some(call => call && typeof call.name === 'string' && call.name.trim());
}

export function createOfficialFunctionResponsePart(toolResult) {
    const name = typeof toolResult?.toolName === 'string' ? toolResult.toolName : '';
    if (!name) return null;

    const functionResponse = {
        name,
        response: {
            output: toolResult?.output ?? '',
            status: toolResult?.status || 'completed'
        }
    };

    if (toolResult?.id) {
        functionResponse.id = toolResult.id;
    }

    return { functionResponse };
}

export function createOfficialFunctionResponseParts(toolResults) {
    if (!Array.isArray(toolResults)) return [];
    return toolResults
        .map(createOfficialFunctionResponsePart)
        .filter(Boolean);
}

export function createOfficialFunctionResponseMessage(toolResults) {
    const parts = createOfficialFunctionResponseParts(toolResults);
    if (parts.length === 0) return null;

    return {
        role: 'user',
        text: '',
        officialContent: {
            role: 'user',
            parts
        }
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
        officialContent: result.officialContent
    };
}

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function isCompleteToolCallObject(value) {
    return isPlainObject(value)
        && typeof value.tool === 'string'
        && value.tool.trim().length > 0
        && isPlainObject(value.args);
}

function stripJsonFence(text) {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    const opening = trimmed.match(/^```(?:json)?\s*/i);
    if (!opening) return trimmed;

    const body = trimmed.slice(opening[0].length);
    const closing = body.match(/\s*```\s*$/);
    return closing ? body.slice(0, closing.index).trim() : body.trim();
}

function parseToolCallObject(text) {
    try {
        const parsed = JSON.parse(stripJsonFence(text));
        return isCompleteToolCallObject(parsed) ? parsed : null;
    } catch (_) {
        return null;
    }
}

function findTrailingFencedToolCall(text) {
    const value = typeof text === 'string' ? text : '';
    const fencePattern = /(^|\n)([ \t]*```(?:json)?[ \t]*\n?[\s\S]*?\n?```[ \t]*)/gi;
    let match;
    let trailingMatch = null;

    while ((match = fencePattern.exec(value)) !== null) {
        if (value.slice(fencePattern.lastIndex).trim() === '') {
            trailingMatch = {
                start: match.index + match[1].length,
                block: match[2]
            };
        }
    }

    if (!trailingMatch || !parseToolCallObject(trailingMatch.block)) return null;

    return {
        start: trailingMatch.start,
        toolCallText: trailingMatch.block.trim()
    };
}

function findTrailingBareToolCall(text) {
    const value = typeof text === 'string' ? text : '';
    const toolPattern = /"tool"\s*:/g;
    const matches = [...value.matchAll(toolPattern)];

    for (let i = matches.length - 1; i >= 0; i--) {
        const toolIndex = matches[i].index;
        const start = value.lastIndexOf('{', toolIndex);
        if (start === -1) continue;

        const before = value.slice(0, start);
        if (before.trim() && !/\n\s*$/.test(before)) continue;

        const candidate = value.slice(start).trim();
        if (parseToolCallObject(candidate)) {
            return {
                start,
                toolCallText: candidate
            };
        }
    }

    return null;
}

export function splitToolCallFromText(text) {
    const value = typeof text === 'string' ? text : '';
    if (!value.trim()) {
        return {
            displayText: value,
            toolCallText: '',
            hasToolCall: false
        };
    }

    const match = findTrailingFencedToolCall(value) || findTrailingBareToolCall(value);
    if (!match) {
        return {
            displayText: value,
            toolCallText: '',
            hasToolCall: false
        };
    }

    return {
        displayText: value.slice(0, match.start).trimEnd(),
        toolCallText: match.toolCallText,
        hasToolCall: true
    };
}

export async function getActiveTabContent(specificTabId = null) {
    try {
        let tab;
        if (specificTabId) {
            try {
                tab = await chrome.tabs.get(specificTabId);
            } catch (e) {
                // Specific tab not found
                return null;
            }
        } else {
            const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            tab = tabs[0];
        }

        if (!tab || !tab.id) return null;

        // Check for restricted URLs
        if (tab.url && (
            tab.url.startsWith('chrome://') || 
            tab.url.startsWith('edge://') || 
            tab.url.startsWith('chrome-extension://') || 
            tab.url.startsWith('about:') ||
            tab.url.startsWith('view-source:') ||
            tab.url.startsWith('https://chrome.google.com/webstore') ||
            tab.url.startsWith('https://chromewebstore.google.com')
        )) {
            return null;
        }

        // Strategy 1: Try sending message to existing content script
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_CONTENT" });
            return response ? response.content : null;
        } catch (e) {
            // Strategy 2: Fallback to Scripting Injection
            console.log("Content script unavailable, attempting fallback injection...");
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => document.body ? document.body.innerText : ""
                });
                return results?.[0]?.result || null;
            } catch (injErr) {
                console.error("Fallback injection failed:", injErr);
                return null;
            }
        }
    } catch (e) {
        console.error("Failed to get page context:", e);
        return null;
    }
}
