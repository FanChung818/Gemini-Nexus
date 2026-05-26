export function handleToggleBrowserControl(context, request, sender, sendResponse) {
    if (context.controlManager) {
        context.controlManager.setOwnerSidePanelTabId?.(
            context.getTargetSidePanelTabId(request, sender)
        );
        if (request.enabled) {
            context.controlManager.enableControl({
                createDefaultTab: request.hostIsTab === true,
            });
        } else {
            context.controlManager.disableControl();
        }
    }
    sendResponse({ status: 'processed' });
}
