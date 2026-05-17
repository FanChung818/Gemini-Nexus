(function () {
    class ToolbarDispatcher {
        constructor(controller) {
            this.controller = controller;
        }

        // Accessors to controller components
        get ui() {
            return this.controller.ui;
        }
        get actions() {
            return this.controller.actions;
        }
        get inputManager() {
            return this.controller.inputManager;
        }
        get imageDetector() {
            return this.controller.imageDetector;
        }

        async dispatch(actionType, data) {
            const currentModel = this.ui.getSelectedModel();

            try {
                switch (actionType) {
                    case 'copy_selection':
                        if (this.controller.currentSelection) {
                            navigator.clipboard
                                .writeText(this.controller.currentSelection)
                                .then(() => this.ui.showCopySelectionFeedback(true))
                                .catch((err) => {
                                    console.error('Failed to copy text:', err);
                                    this.ui.showCopySelectionFeedback(false);
                                });
                        }
                        break;

                    case 'image_analyze':
                    case 'image_describe':
                        {
                            const img = this.imageDetector.getCurrentImage();
                            if (!img) return;

                            const imgUrl = await this._resolveImageUrl(img);
                            const rect = img.getBoundingClientRect();

                            this.ui.hideImageButton();
                            this.controller.lastSessionId = null;
                            // Use unified handler with 'analyze' mode which prompts for description
                            this.actions.handleImagePrompt(imgUrl, rect, 'analyze', currentModel);
                        }
                        break;

                    case 'image_chat':
                        {
                            const img = this.imageDetector.getCurrentImage();
                            if (!img) return;

                            const imgUrl = await this._resolveImageUrl(img);
                            const rect = img.getBoundingClientRect();

                            this.ui.hideImageButton();
                            this.controller.lastSessionId = null;
                            this.actions.handleImageChat(imgUrl, rect);
                        }
                        break;

                    case 'image_extract':
                        {
                            const img = this.imageDetector.getCurrentImage();
                            if (!img) return;

                            const imgUrl = await this._resolveImageUrl(img);
                            const rect = img.getBoundingClientRect();

                            this.ui.hideImageButton();
                            this.controller.lastSessionId = null;
                            // Use 'ocr' mode to prompt for text extraction
                            this.actions.handleImagePrompt(imgUrl, rect, 'ocr', currentModel);
                        }
                        break;

                    case 'image_translate':
                        {
                            const img = this.imageDetector.getCurrentImage();
                            if (!img) return;

                            const imgUrl = await this._resolveImageUrl(img);
                            const rect = img.getBoundingClientRect();

                            this.ui.hideImageButton();
                            this.controller.lastSessionId = null;
                            this.actions.handleImagePrompt(imgUrl, rect, 'translate', currentModel);
                        }
                        break;

                    case 'image_remove_bg':
                    case 'image_remove_text':
                    case 'image_remove_watermark':
                    case 'image_upscale':
                    case 'image_expand':
                        {
                            const img = this.imageDetector.getCurrentImage();
                            if (!img) return;

                            const imgUrl = await this._resolveImageUrl(img);
                            const rect = img.getBoundingClientRect();

                            this.ui.hideImageButton();
                            this.controller.lastSessionId = null;

                            let mode = 'remove_text';
                            if (actionType === 'image_upscale') mode = 'upscale';
                            if (actionType === 'image_remove_bg') mode = 'remove_bg';
                            if (actionType === 'image_remove_watermark') mode = 'remove_watermark';
                            if (actionType === 'image_expand') mode = 'expand';

                            this.actions.handleImagePrompt(imgUrl, rect, mode, currentModel);
                        }
                        break;

                    case 'ask':
                        if (this.controller.currentSelection) {
                            this.controller.hide(); // Hides small toolbar
                            this.ui.showAskWindow(
                                this.controller.lastRect,
                                this.controller.currentSelection,
                                window.GeminiToolbarStrings?.ask || 'Ask Gemini',
                                this.controller.lastMousePoint
                            );
                            this.controller.visible = true; // Mark window as visible
                        }
                        break;

                    case 'translate':
                    case 'explain':
                    case 'summarize':
                        if (!this.controller.currentSelection) return;
                        this.controller.lastSessionId = null;
                        this.actions.handleQuickAction(
                            actionType,
                            this.controller.currentSelection,
                            this.controller.lastRect,
                            currentModel,
                            this.controller.lastMousePoint
                        );
                        break;

                    case 'grammar':
                        if (!this.controller.currentSelection) return;
                        this.ui.setGrammarMode(
                            true,
                            this.inputManager.source,
                            this.inputManager.range
                        );
                        this.controller.lastSessionId = null;
                        this.actions.handleQuickAction(
                            actionType,
                            this.controller.currentSelection,
                            this.controller.lastRect,
                            currentModel,
                            this.controller.lastMousePoint
                        );
                        break;

                    case 'insert_result':
                        this._handleInsert(data, false);
                        break;

                    case 'replace_result':
                        this._handleInsert(data, true);
                        break;

                    case 'submit_ask':
                        const question = data;
                        const context = this.controller.currentSelection;
                        if (question) {
                            this.actions.handleSubmitAsk(
                                question,
                                context,
                                this.controller.lastSessionId,
                                currentModel
                            );
                        }
                        break;

                    case 'retry_ask':
                        this.actions.handleRetry();
                        break;

                    case 'cancel_ask':
                        this.actions.handleCancel();
                        this.ui.hideAskWindow();
                        this.controller.visible = false;
                        this.controller.lastSessionId = null;
                        break;

                    case 'stop_ask':
                        this.actions.handleCancel();
                        this.ui.stopLoading();
                        break;

                    case 'continue_chat':
                        this.actions.handleContinueChat(this.controller.lastSessionId);
                        this.ui.hideAskWindow();
                        this.controller.visible = false;
                        this.controller.lastSessionId = null;
                        break;
                }
            } catch (error) {
                if (this._isImageAction(actionType)) {
                    await this._showImageLoadError();
                    return;
                }
                throw error;
            }
        }

        _isImageAction(actionType) {
            return typeof actionType === 'string' && actionType.startsWith('image_');
        }

        async _showImageLoadError() {
            const img = this.imageDetector.getCurrentImage();
            const rect = img?.getBoundingClientRect?.() || this.controller.lastRect;
            if (!rect) return;

            this.ui.hideImageButton();
            await this.ui.showAskWindow(
                rect,
                null,
                window.GeminiToolbarStrings?.imageTools || 'Image tools'
            );
            this.ui.showError(
                window.GeminiToolbarStrings?.errors?.imageLoadFailed ||
                    'Could not read this image. Try opening the original image or choose another one.'
            );
        }

        async _resolveImageUrl(img) {
            const url = img?.currentSrc || img?.src || '';
            if (url.startsWith('blob:')) {
                return await this._blobUrlToDataUrl(url);
            }
            return url;
        }

        async _blobUrlToDataUrl(url) {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load blob image: ${response.status}`);
            }
            const blob = await response.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        _handleInsert(text, replace) {
            if (!this.inputManager.hasSource()) {
                navigator.clipboard
                    .writeText(text)
                    .then(() => {
                        this.ui.showError('Text copied to clipboard (not in editable field)');
                    })
                    .catch(() => {
                        this.ui.showError('Cannot insert: not in editable field');
                    });
                return;
            }

            const success = this.inputManager.insert(text, replace);
            if (success) {
                this.ui.showInsertReplaceButtons(false);
            } else {
                this.ui.showError('Failed to insert text');
            }
        }
    }

    // Export to Window
    window.GeminiToolbarDispatcher = ToolbarDispatcher;
})();
