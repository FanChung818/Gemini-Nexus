(function () {
    class MessageRouter {
        constructor() {
            this.toolbarController = null;
            this.selectionOverlay = null;
            this.captureSource = null;
            this.captureTargetSidePanelTabId = null;
        }

        init(toolbarController, selectionOverlay) {
            this.toolbarController = toolbarController;
            this.selectionOverlay = selectionOverlay;

            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                return this.handle(request, sender, sendResponse);
            });
        }

        handle(request, sender, sendResponse) {
            if (request.action === 'CONTEXT_MENU_ACTION') {
                if (this.toolbarController) {
                    this.toolbarController.handleContextAction(request.mode);
                }
                sendResponse({ status: 'ok' });
                return true;
            }

            if (request.action === 'START_SELECTION') {
                this.captureSource = request.source;
                this.captureTargetSidePanelTabId = request.targetSidePanelTabId || null;

                // Hide floating UI to prevent self-capture artifacts
                if (this.toolbarController) {
                    this.toolbarController.hideAll();
                    if (request.mode) {
                        this.toolbarController.currentMode = request.mode;
                    }
                }

                this.selectionOverlay.start(request.image);
                sendResponse({ status: 'selection_started' });
                return true;
            }

            if (request.action === 'CROP_SCREENSHOT') {
                if (this.captureSource === 'sidepanel') {
                    // Forward back to sidepanel via background
                    chrome.runtime.sendMessage({
                        action: 'PROCESS_CROP_IN_SIDEPANEL',
                        payload: {
                            ...request,
                            tabId: this.captureTargetSidePanelTabId,
                        },
                    });
                    this.captureSource = null;
                    this.captureTargetSidePanelTabId = null;
                } else {
                    // Handle locally
                    if (this.toolbarController) {
                        this.toolbarController.handleCropResult(request);
                    }
                    this.captureTargetSidePanelTabId = null;
                }
                sendResponse({ status: 'ok' });
                return true;
            }

            if (request.action === 'GENERATED_IMAGE_RESULT') {
                if (this.toolbarController) {
                    this.toolbarController.handleGeneratedImageResult(request);
                }
                sendResponse({ status: 'ok' });
                return true;
            }

            if (request.action === 'GET_SELECTION') {
                sendResponse({ selection: window.getSelection().toString() });
                return true;
            }

            if (request.action === 'GET_PAGE_CONTENT') {
                this._getPageContent(sendResponse);
                return true;
            }

            return false;
        }

        _getPageContent(sendResponse) {
            try {
                let text = document.body.innerText || '';
                text = text.replace(/\n{3,}/g, '\n\n');
                sendResponse({ content: text });
            } catch (error) {
                sendResponse({ content: '', error: error.message });
            }
        }
    }

    window.GeminiMessageRouter = new MessageRouter();
})();
