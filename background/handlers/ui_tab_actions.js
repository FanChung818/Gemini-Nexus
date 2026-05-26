import { toControlTabSummary } from '../control/tabs.js';
import { respondWithUiTask } from './ui_async.js';

function sendOpenTabsResult(context, request, sender, payload) {
    chrome.runtime
        .sendMessage({
            action: 'OPEN_TABS_RESULT',
            tabId: context.getTargetSidePanelTabId(request, sender),
            ...payload,
        })
        .catch(() => {});
}

export function handleGetOpenTabs(context, request, sender, sendResponse) {
    respondWithUiTask(
        sendResponse,
        async () => {
            const tabQuery = { currentWindow: true };
            const groupId = context.controlManager?.getControlledGroupId?.();
            const windowId = context.controlManager?.getControlledWindowId?.();
            if (Number.isInteger(windowId) && windowId > 0) {
                delete tabQuery.currentWindow;
                tabQuery.windowId = windowId;
            }
            if (Number.isInteger(groupId) && groupId >= 0) {
                tabQuery.groupId = groupId;
            }

            const tabs = await chrome.tabs.query(tabQuery);
            const safeTabs = tabs.map((tab) => toControlTabSummary(tab));
            const lockedTabId = context.controlManager
                ? context.controlManager.getTargetTabId()
                : null;

            sendOpenTabsResult(context, request, sender, {
                tabs: safeTabs,
                lockedTabId,
            });
        },
        {
            errorLabel: 'Open tabs lookup error',
            onError: (error) =>
                sendOpenTabsResult(context, request, sender, {
                    tabs: [],
                    lockedTabId: context.controlManager
                        ? context.controlManager.getTargetTabId()
                        : null,
                    error: error?.message || String(error),
                }),
        }
    );
}

export function handleSwitchTab(context, request, sender, sendResponse) {
    respondWithUiTask(sendResponse, async () => {
        const tabId = request.tabId || null;
        if (
            tabId &&
            context.controlManager?.isTabControllable &&
            !(await context.controlManager.isTabControllable(tabId))
        ) {
            return { status: 'error', error: 'Tab cannot be controlled.' };
        }

        if (context.controlManager) {
            context.controlManager.setOwnerSidePanelTabId?.(
                context.getTargetSidePanelTabId(request, sender)
            );
            context.controlManager.setTargetTab(tabId);
        }
        if (tabId && request.switchVisual !== false) {
            chrome.tabs
                .update(tabId, { active: true })
                .catch((tabUpdateError) => console.warn(tabUpdateError));
        }
        return { status: 'switched' };
    });
}
