import { appendTurnToHistory, saveToHistory } from '../../managers/history_manager.js';

const IMAGE_EDIT_MODES = new Set([
    'upscale',
    'expand',
    'remove_text',
    'remove_bg',
    'remove_watermark',
]);

export class QuickAskHandler {
    constructor(sessionManager, imageHandler) {
        this.sessionManager = sessionManager;
        this.imageHandler = imageHandler;
    }

    _sendToTab(tabId, payload) {
        if (!tabId) return;
        chrome.tabs.sendMessage(tabId, payload).catch(() => {});
    }

    _createStreamUpdateHandler(tabId) {
        return (partialText, partialThoughts) => {
            this._sendToTab(tabId, {
                action: 'GEMINI_STREAM_UPDATE',
                text: partialText,
                thoughts: partialThoughts,
            });
        };
    }

    _sendStreamDone(tabId, result, savedSession) {
        const payload = {
            action: 'GEMINI_STREAM_DONE',
            result,
        };

        if (savedSession !== undefined) {
            payload.sessionId = savedSession ? savedSession.id : null;
        }

        this._sendToTab(tabId, payload);
    }

    async _saveSuccessfulResult(text, result, filesObj = null, sessionId = null) {
        if (result && result.status === 'success') {
            if (sessionId) {
                const existingSession = await appendTurnToHistory(
                    sessionId,
                    text,
                    result,
                    filesObj
                );
                if (existingSession) return existingSession;
            }
            return await saveToHistory(text, result, filesObj);
        }
        return null;
    }

    async handleQuickAsk(request, sender) {
        const tabId = sender.tab ? sender.tab.id : null;

        if (!request.sessionId) {
            await this.sessionManager.resetContext();
        } else {
            await this.sessionManager.ensureInitialized();
        }

        const onUpdate = this._createStreamUpdateHandler(tabId);
        const result = await this.sessionManager.handleSendPrompt(request, onUpdate);
        const savedSession = await this._saveSuccessfulResult(
            request.text,
            result,
            null,
            request.sessionId || null
        );
        this._sendStreamDone(tabId, result, savedSession);
    }

    async handleQuickAskImage(request, sender) {
        const tabId = sender.tab ? sender.tab.id : null;

        const imgRes = await this.imageHandler.fetchImage(request.url);

        if (imgRes.error) {
            this._sendStreamDone(tabId, {
                status: 'error',
                text: 'Failed to load image: ' + imgRes.error,
            });
            return;
        }

        const promptRequest = {
            text: request.text,
            model: request.model,
            files: [
                {
                    base64: imgRes.base64,
                    type: imgRes.type,
                    name: imgRes.name,
                },
            ],
        };

        await this.sessionManager.resetContext();

        const onUpdate = this._createStreamUpdateHandler(tabId);
        const result = await this.sessionManager.handleSendPrompt(promptRequest, onUpdate);
        const normalizedResult = this._normalizeImageQuickAskResult(request, result);
        const savedSession = await this._saveSuccessfulResult(request.text, normalizedResult, [
            { base64: imgRes.base64 },
        ]);
        this._sendStreamDone(tabId, normalizedResult, savedSession);
    }

    _normalizeImageQuickAskResult(request, result) {
        if (!result) return result;

        if (!IMAGE_EDIT_MODES.has(request.imageMode)) {
            if (!Array.isArray(result.images) || result.images.length === 0) return result;
            return {
                ...result,
                images: [],
            };
        }

        if (!Array.isArray(result.images) || result.images.length <= 1) return result;

        return {
            ...result,
            images: result.images.slice(0, 1),
        };
    }
}
