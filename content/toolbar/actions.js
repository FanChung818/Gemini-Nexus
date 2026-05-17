const GEMINI_IMAGE_EDIT_MODES = new Set([
    'upscale',
    'expand',
    'remove_text',
    'remove_bg',
    'remove_watermark',
]);

class ToolbarActions {
    constructor(uiController) {
        this.ui = uiController;
        this.lastRequest = null;
        this.pendingImageChat = null;
    }

    get t() {
        return window.GeminiToolbarStrings;
    }

    /**
     * Handles Image Prompts (Screenshot, OCR, Analysis)
     * @param {string} imageDataUrl - Image Data URL
     * @param {object} rect - Display position
     * @param {string} mode - 'ocr' | 'translate' | 'snip' | 'analyze' | 'upscale' | 'expand' | 'remove_text' | 'remove_bg' | 'remove_watermark'
     * @param {string} model - Model name
     */
    async handleImagePrompt(imageDataUrl, rect, mode, model = 'gemini-3-flash') {
        const strings = this.t;
        let title, prompt, loadingMessage, inputValue;

        switch (mode) {
            case 'ocr':
                title = strings.titles.ocr;
                prompt = strings.prompts.ocr;
                loadingMessage = strings.loading.ocr;
                inputValue = strings.inputs.ocr;
                break;
            case 'translate':
                title = strings.titles.translate;
                prompt = strings.prompts.imageTranslate;
                loadingMessage = strings.loading.translate;
                inputValue = strings.inputs.translate;
                break;
            case 'analyze': // General Image Analysis (from Hover button)
                title = strings.titles.analyze;
                prompt = strings.prompts.analyze;
                loadingMessage = strings.loading.analyze;
                inputValue = strings.inputs.analyze;
                break;
            case 'upscale':
                title = strings.titles.upscale;
                prompt = strings.prompts.upscale;
                loadingMessage = strings.loading.upscale;
                inputValue = strings.inputs.upscale;
                break;
            case 'expand':
                title = strings.titles.expand;
                prompt = strings.prompts.expand;
                loadingMessage = strings.loading.expand;
                inputValue = strings.inputs.expand;
                break;
            case 'remove_text':
                title = strings.titles.removeText;
                prompt = strings.prompts.removeText;
                loadingMessage = strings.loading.removeText;
                inputValue = strings.inputs.removeText;
                break;
            case 'remove_bg':
                title = strings.titles.removeBg;
                prompt = strings.prompts.removeBg;
                loadingMessage = strings.loading.removeBg;
                inputValue = strings.inputs.removeBg;
                break;
            case 'remove_watermark':
                title = strings.titles.removeWatermark;
                prompt = strings.prompts.removeWatermark;
                loadingMessage = strings.loading.removeWatermark;
                inputValue = strings.inputs.removeWatermark;
                break;
            case 'snip':
            default:
                title = strings.titles.snip;
                prompt = strings.prompts.snipAnalyze;
                loadingMessage = strings.loading.snip;
                inputValue = strings.inputs.snip;
                break;
        }

        if ((this.ui.provider || 'web') !== 'web' && GEMINI_IMAGE_EDIT_MODES.has(mode)) {
            await this.ui.showAskWindow(rect, null, title);
            this.ui.setInputValue(inputValue);
            this.ui.showError(
                strings.errors?.imageEditWebOnly ||
                    'Image editing is only available when using Gemini Web.'
            );
            return;
        }

        await this.ui.showAskWindow(rect, loadingMessage, title);
        this.ui.showLoading(loadingMessage);
        this.ui.setInputValue(inputValue);

        const targetModel = window.GeminiWebModels.resolveImagePromptModel({
            provider: this.ui.provider || 'web',
            mode,
            model,
        });

        const message = {
            action: 'QUICK_ASK_IMAGE',
            url: imageDataUrl,
            text: prompt,
            model: targetModel,
            imageMode: mode,
        };

        this.lastRequest = message;
        chrome.runtime.sendMessage(message);
    }

    async handleImageChat(imageDataUrl, rect) {
        this.pendingImageChat = {
            url: imageDataUrl,
        };

        const title = this.t.chatWithImage || this.t.titles.analyze;
        await this.ui.showAskWindow(rect, null, title);
        this.ui.setInputValue('');
    }

    async handleQuickAction(
        actionType,
        selection,
        rect,
        model = 'gemini-3-flash',
        mousePoint = null
    ) {
        const strings = this.t;
        let prompt, title, inputPlaceholder, loadingMessage;

        if (actionType === 'translate') {
            prompt = strings.prompts.textTranslate(selection);
            title = strings.titles.textTranslate;
            inputPlaceholder = strings.inputs.textTranslate;
            loadingMessage = strings.loading.translate;
        } else if (actionType === 'summarize') {
            prompt = strings.prompts.summarize(selection);
            title = strings.titles.summarize;
            inputPlaceholder = strings.inputs.summarize;
            loadingMessage = strings.loading.summarize;
        } else if (actionType === 'grammar') {
            prompt = strings.prompts.grammar(selection);
            title = strings.titles.grammar;
            inputPlaceholder = strings.inputs.grammar;
            loadingMessage = strings.loading.grammar;
        } else if (actionType === 'explain') {
            prompt = strings.prompts.explain(selection);
            title = strings.titles.explain;
            inputPlaceholder = strings.inputs.explain;
            loadingMessage = strings.loading.explain;
        } else {
            prompt = selection;
            title = 'AI';
            inputPlaceholder = '';
            loadingMessage = strings.loading.analyze;
        }

        this.ui.hide();
        await this.ui.showAskWindow(rect, selection, title, mousePoint);
        this.ui.showLoading(loadingMessage);

        this.ui.setInputValue(inputPlaceholder);

        const message = {
            action: 'QUICK_ASK',
            text: prompt,
            model,
        };

        this.lastRequest = message;
        chrome.runtime.sendMessage(message);
    }

    handleSubmitAsk(question, context, sessionId = null, model = 'gemini-3-flash') {
        this.ui.showLoading();

        if (this.pendingImageChat) {
            const targetModel = window.GeminiWebModels.resolveImagePromptModel({
                provider: this.ui.provider || 'web',
                mode: 'chat',
                model,
            });
            const message = {
                action: 'QUICK_ASK_IMAGE',
                url: this.pendingImageChat.url,
                text: question,
                model: targetModel,
                imageMode: 'chat',
                sessionId,
            };

            this.pendingImageChat = null;
            this.lastRequest = message;
            chrome.runtime.sendMessage(message);
            return;
        }

        let prompt = question;
        let includePageContext = false;

        if (context === '__PAGE_CONTEXT_FORCE__') {
            includePageContext = true;
            context = null;
        }

        if (context) {
            prompt = `Context:\n${context}\n\nQuestion: ${question}`;
        }

        const message = {
            action: 'QUICK_ASK',
            text: prompt,
            model,
            sessionId,
            includePageContext,
        };

        this.lastRequest = message;
        chrome.runtime.sendMessage(message);
    }

    handleRetry() {
        if (!this.lastRequest) return;

        const currentModel = this.ui.getSelectedModel();
        const retryRequest = { ...this.lastRequest };
        if (currentModel) {
            retryRequest.model =
                retryRequest.action === 'QUICK_ASK_IMAGE'
                    ? window.GeminiWebModels.resolveImagePromptModel({
                          provider: this.ui.provider || 'web',
                          mode: retryRequest.imageMode,
                          model: currentModel,
                      })
                    : currentModel;
        }

        this.lastRequest = retryRequest;
        const loadingMessage = this.t.loading.regenerate;
        this.ui.showLoading(loadingMessage);
        chrome.runtime.sendMessage(retryRequest);
    }

    handleCancel() {
        this.pendingImageChat = null;
        chrome.runtime.sendMessage({ action: 'CANCEL_PROMPT' });
    }

    handleContinueChat(sessionId) {
        chrome.runtime.sendMessage({
            action: 'OPEN_SIDE_PANEL',
            sessionId,
        });
    }
}

window.GeminiToolbarActions = ToolbarActions;
