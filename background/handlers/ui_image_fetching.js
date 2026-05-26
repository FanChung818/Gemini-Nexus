import { respondWithUiTask } from './ui_async.js';

export function handleFetchImage(context, request, sender, sendResponse) {
    respondWithUiTask(
        sendResponse,
        async () => {
            const result = await context.imageHandler.fetchImage(request.url);
            chrome.runtime
                .sendMessage({
                    ...result,
                    tabId: context.getTargetSidePanelTabId(request, sender),
                })
                .catch(() => {});
        },
        { errorLabel: 'Fetch image error', errorResponse: { status: 'completed' } }
    );
}

export function handleFetchGeneratedImage(context, request, sender, sendResponse) {
    respondWithUiTask(
        sendResponse,
        async () => {
            const result = await context.imageHandler.fetchImage(request.url);

            context.sendToRequestSource(sender, {
                action: 'GENERATED_IMAGE_RESULT',
                tabId: context.getTargetSidePanelTabId(request, sender),
                reqId: request.reqId,
                base64: result.base64,
                error: result.error,
            });
        },
        {
            errorLabel: 'Fetch generated image error',
            errorResponse: { status: 'completed' },
            onError: (error) => {
                context.sendToRequestSource(sender, {
                    action: 'GENERATED_IMAGE_RESULT',
                    tabId: context.getTargetSidePanelTabId(request, sender),
                    reqId: request.reqId,
                    error: error.message || String(error),
                });
            },
        }
    );
}
