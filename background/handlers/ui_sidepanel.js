import { getPanelPathForTab } from '../managers/sidepanel_scope_manager.js';
import { respondWithUiTask } from './ui_async.js';

export function handleOpenSidePanel(context, request, sender, sendResponse) {
    respondWithUiTask(sendResponse, () => openSidePanel(context, request, sender), {
        errorLabel: 'Side panel open error',
    });
}

export function handleToggleSidePanelControl(context, request, sender, sendResponse) {
    respondWithUiTask(
        sendResponse,
        async () => {
            const result = await toggleSidePanelControl(context, request, sender);
            if (result?.status === 'error') {
                return result;
            }
            return { status: 'processed' };
        },
        {
            errorLabel: 'Side panel control toggle error',
        }
    );
}

async function openSidePanel(context, request, sender) {
    if (!sender.tab) {
        return { status: 'error', error: 'No active tab for side panel.' };
    }

    let openPromise;
    try {
        if (context.sidePanelScopeManager) {
            openPromise = context.sidePanelScopeManager.openForTab(
                sender.tab.id,
                sender.tab.windowId
            );
        } else {
            chrome.sidePanel
                .setOptions({
                    tabId: sender.tab.id,
                    enabled: true,
                    path: getPanelPathForTab(sender.tab.id),
                })
                .catch(() => {});
            openPromise = chrome.sidePanel.open({
                tabId: sender.tab.id,
                windowId: sender.tab.windowId,
            });
        }
    } catch (error) {
        console.error('Could not start side panel open flow:', error);
        return { status: 'error', error: error.message || String(error) };
    }

    const pendingSidePanelUpdates = {};
    if (request.sessionId) pendingSidePanelUpdates.pendingSessionId = request.sessionId;
    if (request.mode) pendingSidePanelUpdates.pendingMode = request.mode;

    if (Object.keys(pendingSidePanelUpdates).length > 0) {
        await chrome.storage.local.set(pendingSidePanelUpdates);
        setTimeout(() => {
            chrome.storage.local.remove(Object.keys(pendingSidePanelUpdates));
        }, 5000);
    }

    try {
        await openPromise;
    } catch (error) {
        const pendingKeys = Object.keys(pendingSidePanelUpdates);
        if (pendingKeys.length > 0) {
            chrome.storage.local.remove(pendingKeys).catch(() => {});
        }
        console.error('Could not open side panel:', error);
        return { status: 'error', error: error.message || String(error) };
    }

    queueSidePanelFollowupMessages(request, sender);
    return { status: 'opened' };
}

async function toggleSidePanelControl(context, request, sender) {
    if (!sender.tab) {
        return { status: 'error', error: 'No active tab for side panel.' };
    }

    const tabId = sender.tab.id;
    const currentLock = context.controlManager?.getTargetTabId?.() ?? null;

    if (currentLock === tabId) {
        await closeControlledSidePanel(context, tabId);
        return { status: 'processed' };
    }

    if (context.controlManager) {
        context.controlManager.setOwnerSidePanelTabId(
            context.getTargetSidePanelTabId(request, sender)
        );
    }
    return openSidePanel(context, { ...request, mode: 'browser_control' }, sender);
}

async function closeControlledSidePanel(context, tabId) {
    if (context.controlManager) {
        await context.controlManager.disableControl();
    }

    try {
        await chrome.sidePanel.setOptions({ tabId, enabled: false });
        setTimeout(() => {
            chrome.sidePanel.setOptions({
                tabId,
                enabled: true,
                path: getPanelPathForTab(tabId),
            });
        }, 250);
    } catch (error) {
        console.error('Failed to toggle side panel close:', error);
    }
}

function queueSidePanelFollowupMessages(request, sender) {
    setTimeout(() => {
        if (request.sessionId) {
            chrome.runtime
                .sendMessage({
                    action: 'SWITCH_SESSION',
                    tabId: sender.tab.id,
                    sessionId: request.sessionId,
                })
                .catch(() => {});
        }
        if (request.mode === 'browser_control') {
            chrome.runtime
                .sendMessage({
                    action: 'ACTIVATE_BROWSER_CONTROL',
                    tabId: sender.tab.id,
                })
                .catch(() => {});
        }
    }, 500);
}
