(function () {
    const TOOLBAR_MODEL_STORAGE_KEYS = [
        'geminiModel',
        'geminiProvider',
        'geminiUseOfficialApi',
        'geminiOfficialModel',
        'geminiOpenaiModel',
        'geminiOpenaiSelectedModel',
    ];

    class ToolbarController {
        constructor() {
            this.ui = new window.GeminiToolbarUI();
            this.actions = new window.GeminiToolbarActions(this.ui);

            this.imageDetector = new window.GeminiImageDetector({
                onShow: (rect) => this.ui.showImageButton(rect),
                onHide: () => this.ui.hideImageButton(),
            });

            const streamHandler = new window.GeminiStreamHandler(this.ui, {
                onSessionId: (id) => {
                    this.lastSessionId = id;
                },
            });
            streamHandler.init();

            this.inputManager = new window.GeminiInputManager();

            this.dispatcher = new window.GeminiToolbarDispatcher(this);

            new window.GeminiSelectionObserver({
                onSelection: this.handleSelection.bind(this),
                onClear: this.handleSelectionClear.bind(this),
                onClick: this.handleClick.bind(this),
            });

            this.visible = false;
            this.currentSelection = '';
            this.lastRect = null;
            this.lastMousePoint = null;
            this.lastSessionId = null;
            this.currentMode = 'ask';
            this.isSelectionEnabled = true;

            this.handleAction = this.handleAction.bind(this);

            this.init();
        }

        init() {
            this.ui.build();
            this.ui.setCallbacks({
                onAction: this.handleAction,
                onModelChange: (model) => this.handleModelChange(model),
                onImageBtnHover: (isHovering) => {
                    if (isHovering) {
                        this.imageDetector.cancelHide();
                    } else {
                        this.imageDetector.scheduleHide();
                    }
                },
            });

            this.syncSettings();

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local') {
                    if (TOOLBAR_MODEL_STORAGE_KEYS.some((key) => changes[key])) {
                        this.syncSettings();
                    }
                }
            });

            this.imageDetector.init();

            window.addEventListener('gemini-toolbar-language-changed', () => {
                this.ui.rebuildForLanguageChange();
                this.syncSettings();
            });
        }

        async syncSettings() {
            const result = await chrome.storage.local.get(TOOLBAR_MODEL_STORAGE_KEYS);

            const settings = {
                provider: result.geminiProvider,
                useOfficialApi: result.geminiUseOfficialApi,
                officialModel: result.geminiOfficialModel,
                openaiModel: result.geminiOpenaiModel,
            };

            const provider = settings.provider || (settings.useOfficialApi ? 'official' : 'web');
            const selectedModel =
                provider === 'openai'
                    ? result.geminiOpenaiSelectedModel || result.geminiModel
                    : result.geminiModel;
            this.ui.updateModelList(settings, selectedModel);
        }

        setSelectionEnabled(enabled) {
            this.isSelectionEnabled = enabled;
            if (!enabled) {
                this.handleSelectionClear();
            }
        }

        setImageToolsEnabled(enabled) {
            this.imageDetector.setEnabled(enabled);
        }

        handleContextAction(mode) {
            this.currentMode = mode;

            if (mode === 'ask') {
                this.showGlobalInput(false);
            } else if (mode === 'page_chat') {
                this.showGlobalInput(true);
            } else {
                chrome.runtime.sendMessage({ action: 'INITIATE_CAPTURE' });
            }
        }

        async handleCropResult(request) {
            const rect = {
                left: window.innerWidth / 2 - 200,
                top: 100,
                right: window.innerWidth / 2 + 200,
                bottom: 200,
                width: 400,
                height: 100,
            };

            const model = this.ui.getSelectedModel();

            let finalImage = request.image;
            if (window.GeminiImageCropper && request.area) {
                try {
                    finalImage = await window.GeminiImageCropper.crop(request.image, request.area);
                } catch (error) {
                    console.error('Crop failed in content script', error);
                }
            }

            if (this.currentMode === 'ocr') {
                this.actions.handleImagePrompt(finalImage, rect, 'ocr', model);
            } else if (this.currentMode === 'screenshot_translate') {
                this.actions.handleImagePrompt(finalImage, rect, 'translate', model);
            } else if (this.currentMode === 'snip') {
                this.actions.handleImagePrompt(finalImage, rect, 'snip', model);
            }

            this.currentMode = 'ask';
            this.visible = true;
        }

        handleGeneratedImageResult(request) {
            if (request.base64 && this.ui) {
                this.ui
                    .processImage(request.base64)
                    .then((cleaned) => {
                        this.ui.handleGeneratedImageResult({ ...request, base64: cleaned });
                    })
                    .catch(() => {
                        this.ui.handleGeneratedImageResult(request);
                    });
                return;
            }
            this.ui.handleGeneratedImageResult(request);
        }

        handleClick(event) {
            if (this.ui.isHost(event.target)) return;

            this.hide();
        }

        handleSelection(data) {
            if (!this.isSelectionEnabled) return;

            const { text, rect, mousePoint } = data;
            this.currentSelection = text;
            this.lastRect = rect;
            this.lastMousePoint = mousePoint;

            this.inputManager.capture();

            this.ui.showGrammarButton(this.inputManager.hasSource());

            this.show(rect, mousePoint);
        }

        handleSelectionClear() {
            if (!this.ui.isWindowVisible()) {
                this.currentSelection = '';
                this.inputManager.reset();
                this.hide();
            }
        }

        handleModelChange(model) {
            const provider = this.ui.getProvider ? this.ui.getProvider() : 'web';
            if (provider === 'openai') {
                chrome.storage.local.set({ geminiOpenaiSelectedModel: model });
                return;
            }

            chrome.storage.local.set({ geminiModel: model });
        }

        handleAction(actionType, data) {
            this.dispatcher.dispatch(actionType, data);
        }

        show(rect, mousePoint) {
            this.lastRect = rect;
            this.ui.show(rect, mousePoint);
            this.visible = true;
        }

        hide() {
            if (this.ui.isWindowVisible()) return;
            if (!this.visible) return;
            this.ui.hide();
            this.visible = false;
        }

        hideAll() {
            this.ui.hideAll();
            this.visible = false;
        }

        showGlobalInput(withPageContext = false) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const width = 400;
            const height = 100;

            const left = (viewportWidth - width) / 2;
            const top = viewportHeight / 2 - 200;

            const rect = {
                left,
                top,
                right: left + width,
                bottom: top + height,
                width,
                height,
            };

            this.ui.hide();
            const strings = window.GeminiToolbarStrings || {};

            let title = strings.ask || 'Ask Gemini';
            if (withPageContext) {
                title = strings.chatWithPage || 'Chat with Page';
            }

            this.ui.showAskWindow(rect, null, title);

            this.ui.setInputValue('');
            this.currentSelection = '';
            this.lastSessionId = null;
            this.visible = true;

            if (withPageContext) {
                this.currentSelection = '__PAGE_CONTEXT_FORCE__';
            }
        }
    }

    window.GeminiToolbarController = ToolbarController;
})();
