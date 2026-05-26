import { getActiveTabContent } from './session/active_tab_content.js';
import { respondWithUiTask } from './ui_async.js';

async function getRequestTab(context, request, sender) {
    const targetTabId = context.getTargetSidePanelTabId(request, sender);
    if (Number.isInteger(targetTabId) && targetTabId > 0) {
        try {
            return await chrome.tabs.get(targetTabId);
        } catch {}
    }

    if (sender.tab?.id) return sender.tab;

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab || null;
}

export function handleGetActiveSelection(context, request, sender, sendResponse) {
    respondWithUiTask(
        sendResponse,
        async () => {
            const tab = await getRequestTab(context, request, sender);
            if (tab) {
                await sendSelectionResult(context, request, sender, tab.id);
            }
        },
        { errorLabel: 'Active selection lookup error', errorResponse: { status: 'completed' } }
    );
}

export function handleCheckPageContext(context, request, sender, sendResponse) {
    respondWithUiTask(sendResponse, async () => {
        const tab = await getRequestTab(context, request, sender);
        const content = await getActiveTabContent(tab?.id || null);
        return {
            action: 'PAGE_CONTEXT_RESULT',
            length: content ? content.length : 0,
        };
    });
}

async function sendSelectionResult(context, request, sender, tabId) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            action: 'GET_SELECTION',
        });
        sendSelectionMessage(context, request, sender, response ? response.selection : '');
    } catch {
        sendSelectionMessage(context, request, sender, '');
    }
}

function sendSelectionMessage(context, request, sender, text) {
    chrome.runtime
        .sendMessage({
            action: 'SELECTION_RESULT',
            tabId: context.getTargetSidePanelTabId(request, sender),
            text,
        })
        .catch(() => {});
}
