(function () {
    const TOOLBAR_PROVIDER_STORAGE_KEY = 'geminiToolbarProvider';
    const TOOLBAR_MODEL_STORAGE_KEY = 'geminiToolbarModel';
    const TOOLBAR_OPENAI_MODEL_STORAGE_KEY = 'geminiToolbarOpenaiSelectedModel';
    const TRANSLATION_TARGET_STORAGE_KEY = 'geminiTranslationTargets';
    const TOOLBAR_MODEL_STORAGE_KEYS = [
        TOOLBAR_PROVIDER_STORAGE_KEY,
        TOOLBAR_MODEL_STORAGE_KEY,
        TOOLBAR_OPENAI_MODEL_STORAGE_KEY,
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
            this.speechReader = new window.GeminiSpeechReader();

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
                onProviderChange: (provider) => this.handleProviderChange(provider),
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
                    if (changes[TRANSLATION_TARGET_STORAGE_KEY]) {
                        this.ui.restoreTranslationTargets?.();
                    }
                }
            });

            window.addEventListener('gemini-toolbar-language-changed', () => {
                this.ui.rebuildForLanguageChange();
                this.syncSettings();
            });
        }

        async syncSettings() {
            let result;
            try {
                result = await chrome.storage.local.get(TOOLBAR_MODEL_STORAGE_KEYS);
            } catch (error) {
                console.warn(
                    'Failed to sync toolbar provider/model settings:',
                    error?.message || error
                );
                return;
            }

            result = result || {};

            const settings = {
                provider: result.geminiProvider,
                useOfficialApi: result.geminiUseOfficialApi,
                officialModel: result.geminiOfficialModel,
                openaiModel: result.geminiOpenaiModel,
            };

            const provider =
                result[TOOLBAR_PROVIDER_STORAGE_KEY] ||
                settings.provider ||
                (settings.useOfficialApi ? 'official' : 'web');
            settings.provider = provider;
            const selectedModel =
                provider === 'openai'
                    ? result[TOOLBAR_OPENAI_MODEL_STORAGE_KEY] ||
                      result.geminiOpenaiSelectedModel ||
                      result.geminiModel
                    : result[TOOLBAR_MODEL_STORAGE_KEY] || result.geminiModel;
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

        setCustomSelectionTools(tools) {
            this.ui.setCustomSelectionTools?.(Array.isArray(tools) ? tools : []);
        }

        handleContextAction(mode) {
            this.currentMode = mode;

            if (mode === 'ask') {
                this.showGlobalInput(false);
            } else if (mode === 'page_chat') {
                this.showGlobalInput(true);
            } else if (mode === 'read_page') {
                this.readPageAloud();
            } else if (mode === 'read_selection') {
                this.currentSelection = window.getSelection?.().toString().trim() || '';
                this.readSelectionAloud();
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
            if (this.ui) this.ui.handleGeneratedImageResult(request);
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
                chrome.storage.local.set({ [TOOLBAR_OPENAI_MODEL_STORAGE_KEY]: model });
                return;
            }

            chrome.storage.local.set({ [TOOLBAR_MODEL_STORAGE_KEY]: model });
        }

        handleProviderChange(provider) {
            chrome.storage.local.set({ [TOOLBAR_PROVIDER_STORAGE_KEY]: provider });
        }

        handleAction(actionType, data) {
            this.dispatcher.dispatch(actionType, data);
        }

        readSelectionAloud() {
            try {
                this.speechReader.readSelection(this.currentSelection);
            } catch (error) {
                this.showExtensionError(error.message || String(error));
            }
        }

        readPageAloud() {
            try {
                this.speechReader.readPage();
            } catch (error) {
                this.showExtensionError(error.message || String(error));
            }
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

        showExtensionError(message) {
            const width = 400;
            const height = 100;
            const left = (window.innerWidth - width) / 2;
            const top = Math.max(24, window.innerHeight / 2 - 200);
            const rect = {
                left,
                top,
                right: left + width,
                bottom: top + height,
                width,
                height,
            };
            const strings = window.GeminiToolbarStrings || {};

            this.ui.showAskWindow(rect, null, strings.error || 'Gemini Nexus');
            this.ui.showError(message || 'Could not open Gemini Nexus');
            this.visible = true;
        }
    }

    window.GeminiToolbarController = ToolbarController;
})();
