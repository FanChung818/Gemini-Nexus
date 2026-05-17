import { appendMessage } from '../render/message.js';
import { appendContextCompressionNotice } from '../render/context_compression.js';
import { isToolCallOnlyText, splitToolCallFromText } from '../../shared/text/tool_call_text.js';
import { hasDisplayableText, hasDisplayableThoughts } from '../core/displayable_content.js';
import { t } from '../core/i18n.js';
import {
    handleCropScreenshotResult,
    handleGeneratedImageFetchResult,
    handleImageFetchResult,
    handleSelectionTextResult,
} from './message_results.js';
import { hasMatchingReplyMedia } from './message_matchers.js';
import {
    buildToolOutputHistoryText,
    getToolOutputKey,
    getToolOutputStatus,
    getToolStatusKey,
    hasPersistedToolOutput,
} from './message_tools.js';

export class MessageHandler {
    constructor(sessionManager, uiController, imageManager, appController) {
        this.sessionManager = sessionManager;
        this.ui = uiController;
        this.imageManager = imageManager;
        this.app = appController; // Reference back to app for state like captureMode
        this.streamingBubble = null;
        this.contextCompressionNotice = null;
        this.streamStates = new Map();
        this.storageRenderedMessageCounts = new Map();
    }

    async handle(request) {
        switch (request.action) {
            case 'MCP_TEST_RESULT':
                this.handleMcpTestResult(request);
                return;
            case 'MCP_TOOLS_RESULT':
                this.handleMcpToolsResult(request);
                return;
            case 'GEMINI_STREAM_UPDATE':
                this.handleStreamUpdate(request);
                return;
            case 'GEMINI_CONTEXT_STATUS':
                this.handleContextStatus(request);
                return;
            case 'GEMINI_REPLY':
                this.handleGeminiReply(request);
                return;
            case 'TOOL_OUTPUT_MESSAGE':
                this.handleToolOutputMessage(request);
                return;
            case 'TOOL_CALL_STATUS_MESSAGE':
                this.handleToolCallStatusMessage(request);
                return;
            case 'FETCH_IMAGE_RESULT':
                this.handleImageResult(request);
                return;
            case 'SCREEN_CAPTURE_ERROR':
                this.handleScreenCaptureError(request);
                return;
            case 'GENERATED_IMAGE_RESULT':
                await this.handleGeneratedImageResult(request);
                return;
            case 'CROP_SCREENSHOT':
                await this.handleCropResult(request);
                return;
            case 'SELECTION_RESULT':
                this.handleSelectionResult(request);
                return;
            default:
                return;
        }
    }

    handleMcpTestResult(request) {
        if (typeof this.ui?.settings?.updateMcpTestResult === 'function') {
            this.ui.settings.updateMcpTestResult(request);
        }
    }

    handleMcpToolsResult(request) {
        if (typeof this.ui?.settings?.updateMcpToolsResult === 'function') {
            this.ui.settings.updateMcpToolsResult(request);
        }
    }

    handleScreenCaptureError(request) {
        this.ui.updateStatus(request.error || t('screenCaptureFailed'));
        setTimeout(() => this.ui.updateStatus(''), 3000);
    }

    isCurrentSessionMessage(request) {
        const currentSessionId = this.sessionManager.currentSessionId || null;
        const messageSessionId = request.sessionId || null;
        return currentSessionId !== null && messageSessionId === currentSessionId;
    }

    isGeneratingSessionMessage(request) {
        const generatingSessionId = this.app.generatingSessionId || null;
        const messageSessionId = request.sessionId || null;
        return generatingSessionId !== null && messageSessionId === generatingSessionId;
    }

    hasPersistedAiReply(session, request) {
        if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
            return false;
        }

        const lastMessage = session.messages[session.messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'ai') return false;

        const expectedText = request.text || '';
        const actualText = lastMessage.text || '';
        const mediaMatches = hasMatchingReplyMedia(lastMessage, request);
        const textMatches = expectedText
            ? actualText === expectedText || actualText.startsWith(expectedText)
            : actualText.length > 0 || mediaMatches;
        if (!textMatches) return false;

        if (request.thoughts) {
            const actualThoughts = lastMessage.thoughts || '';
            return (
                actualThoughts === request.thoughts || actualThoughts.startsWith(request.thoughts)
            );
        }

        return true;
    }

    markSessionRenderedFromStorage(sessionId, messageCount) {
        if (!sessionId || !Number.isInteger(messageCount)) return;
        this.storageRenderedMessageCounts.set(sessionId, messageCount);
    }

    hasStorageRenderedAiReply(session, request) {
        if (!session || !session.id) return false;
        const renderedCount = this.storageRenderedMessageCounts.get(session.id);
        if (!Number.isInteger(renderedCount)) return false;
        if (!Array.isArray(session.messages) || renderedCount < session.messages.length)
            return false;
        return this.hasPersistedAiReply(session, request);
    }

    getRequestSessionId(request) {
        return request?.sessionId || null;
    }

    cacheStreamState(request) {
        const sessionId = this.getRequestSessionId(request);
        if (!sessionId) return null;

        const previous = this.streamStates.get(sessionId) || {};
        const next = {
            ...previous,
            sessionId,
        };

        if (request.text !== undefined) {
            const rawText = request.text || '';
            const split = splitToolCallFromText(rawText, { allowPartial: true });
            next.rawText = rawText;
            next.text = split.displayText;
            if (split.hasToolCall) {
                next.toolCallText = split.toolCallText;
            }
        }
        if (request.thoughts !== undefined) {
            next.thoughts = request.thoughts || '';
        }
        if (hasDisplayableThoughts(next.thoughts)) {
            if (!Number.isFinite(next.thoughtsStartedAt)) {
                const elapsedSeconds = Number.isFinite(next.thoughtsElapsedSeconds)
                    ? next.thoughtsElapsedSeconds
                    : 0;
                next.thoughtsStartedAt = Date.now() - elapsedSeconds * 1000;
            }
            next.thoughtsElapsedSeconds = Math.max(0, (Date.now() - next.thoughtsStartedAt) / 1000);
        }
        if (request.contextState !== undefined) {
            next.contextState = request.contextState || null;
        }

        this.streamStates.set(sessionId, next);
        return next;
    }

    clearStreamState(sessionId = null) {
        if (sessionId) {
            this.streamStates.delete(sessionId);
            return;
        }
        this.streamStates.clear();
    }

    createStreamingBubble(state = {}) {
        const bubble = appendMessage(this.ui.historyDiv, '', 'ai', null, '', null, {
            isStreaming: true,
            thoughtsStartedAt: state.thoughtsStartedAt,
            thoughtsElapsedSeconds: state.thoughtsElapsedSeconds,
        });

        bubble.update(state.text || '', state.thoughts || '', {
            isStreaming: true,
            thoughtsStartedAt: state.thoughtsStartedAt,
            thoughtsElapsedSeconds: state.thoughtsElapsedSeconds,
        });
        this.streamingBubble = bubble;
    }

    handleStreamUpdate(request) {
        if (!this.isGeneratingSessionMessage(request)) return;
        const state = this.cacheStreamState(request);
        const displayText = state?.text || '';

        // Prevent race condition: Ignore stream updates arriving shortly after user cancelled
        if (this.app.prompt.isCancellationRecent()) {
            this.clearStreamState(this.getRequestSessionId(request));
            return;
        }

        if (!this.isCurrentSessionMessage(request)) return;

        // If we don't have a bubble yet, create one
        if (!this.streamingBubble) {
            this.createStreamingBubble(state);
        }

        // Update content if text or thoughts exist
        this.streamingBubble.update(displayText, request.thoughts, { isStreaming: true });

        // Ensure UI state reflects generation
        if (!this.app.isGenerating) {
            this.app.isGenerating = true;
            this.ui.setLoading(true);
        }
    }

    handleContextStatus(request) {
        if (!this.isGeneratingSessionMessage(request)) return;
        const state = this.cacheStreamState({
            ...request,
            contextState: request.state === 'compressing' ? request.state : null,
        });
        if (!this.isCurrentSessionMessage(request)) return;

        if (request.state === 'compressing') {
            if (this.contextCompressionNotice) {
                this.contextCompressionNotice.dispose?.();
            }
            this.contextCompressionNotice = appendContextCompressionNotice(
                this.ui.historyDiv,
                t('contextCompressing')
            );
            return;
        }

        if (!this.contextCompressionNotice) return;

        if (request.state === 'compressed') {
            this.contextCompressionNotice.update(t('contextCompressed'));
            this.contextCompressionNotice = null;
            if (state) state.contextState = null;
            return;
        }

        if (request.state === 'compression_failed') {
            this.contextCompressionNotice.update(t('contextCompressionFallback'));
            this.contextCompressionNotice = null;
            if (state) state.contextState = null;
        }
    }

    handleGeminiReply(request) {
        if (!this.isGeneratingSessionMessage(request)) return;

        this.app.isGenerating = false;
        this.app.generatingSessionId = null;
        this.ui.setLoading(false);
        this.app.sessionFlow.refreshHistoryUI();
        this.clearStreamState(this.getRequestSessionId(request));

        if (!this.isCurrentSessionMessage(request)) {
            this.resetStream();
            return;
        }

        const session = this.sessionManager.getCurrentSession();
        if (session) {
            // Note: We do NOT save to sessionManager/storage here anymore.
            // The background script saves the AI response to storage and broadcasts 'SESSIONS_UPDATED'.
            // The AppController handles that broadcast to keep data in sync.
            // We just ensure the UI is visually complete here.

            if (request.status === 'success') {
                // Although session data comes from background, we might want to ensure context matches locally
                // just in case further user prompts happen before SESSIONS_UPDATED arrives (rare)
                this.sessionManager.updateContext(session.id, request.context);
            }

            // Update UI
            if (this.streamingBubble) {
                if (this.hasStorageRenderedAiReply(session, request)) {
                    this.resetStream({ remove: true });
                    return;
                }

                // Finalize the streaming bubble with complete text and thoughts
                this.streamingBubble.finalize(request.text, request.thoughts, {
                    thoughtsDurationSeconds: request.thoughtsDurationSeconds,
                });

                // Inject images if any
                if (request.images && request.images.length > 0) {
                    this.streamingBubble.addImages(request.images);
                }

                if (request.sources && request.sources.length > 0) {
                    this.streamingBubble.addSources(request.sources);
                }

                // Clear reference
                this.streamingBubble = null;
            } else {
                // Fallback if no stream occurred (or single short response)
                if (this.hasStorageRenderedAiReply(session, request)) {
                    return;
                }
                appendMessage(
                    this.ui.historyDiv,
                    request.text,
                    'ai',
                    request.images,
                    request.thoughts,
                    request.sources,
                    {
                        isFinal: true,
                        thoughtsDurationSeconds: request.thoughtsDurationSeconds,
                    }
                );
            }
        }
    }

    handleToolOutputMessage(request) {
        if (!this.isGeneratingSessionMessage(request)) return;
        const sessionId = this.getRequestSessionId(request);
        const toolCallText = this.getRequestToolCallText(request, sessionId);

        if (!this.isCurrentSessionMessage(request)) {
            this.clearStreamState(sessionId);
            return;
        }

        this.finalizeActiveStream({
            text: this.getStreamRawText(sessionId) || request.toolCallText,
            thoughts: this.getStreamThoughts(sessionId),
            clearToolCallJson: true,
        });
        this.clearStreamState(sessionId);

        const session = this.sessionManager.getCurrentSession();
        const renderedKey = getToolOutputKey(request);
        if (renderedKey && this.hasRenderedToolOutput(renderedKey)) {
            this.removeRenderedToolStatus(getToolStatusKey(request));
            return;
        }

        this.removeRenderedToolStatus(getToolStatusKey(request));

        if (session && !hasPersistedToolOutput(session, request)) {
            session.messages.push({
                role: 'user',
                text: buildToolOutputHistoryText(request),
                image: request.images || null,
                kind: 'tool-output',
                toolName: request.toolName || '',
                toolStatus: request.status || getToolOutputStatus(request),
                toolCallText,
                toolStep: request.step,
                toolCallIndex: request.callIndex,
                toolCallCount: request.callCount,
            });
            session.timestamp = Date.now();
            this.app.sessionFlow.refreshHistoryUI();
        }

        appendMessage(
            this.ui.historyDiv,
            request.text || '',
            'user',
            request.images || null,
            null,
            null,
            {
                kind: 'tool-output',
                toolName: request.toolName || '',
                toolStatus: request.status || getToolOutputStatus(request),
                toolCallText,
                step: request.step,
                callIndex: request.callIndex,
                callCount: request.callCount,
                toolOutputKey: renderedKey,
            }
        );
        this.ui.scrollToBottom();
    }

    handleToolCallStatusMessage(request) {
        if (!this.isGeneratingSessionMessage(request)) return;
        if (!this.isCurrentSessionMessage(request)) return;

        const sessionId = this.getRequestSessionId(request);
        const toolCallText = this.getRequestToolCallText(request, sessionId);
        this.finalizeActiveStream({
            text: this.getStreamRawText(sessionId) || request.toolCallText,
            thoughts: this.getStreamThoughts(sessionId),
            clearToolCallJson: true,
        });
        this.clearStreamState(sessionId);

        const statusKey = request.statusKey || getToolStatusKey(request);
        const existing = this.findRenderedToolStatus(statusKey);
        if (existing && typeof existing.update === 'function') {
            existing.update(request.text || '', null, {
                toolStatus: request.status || 'completed',
                toolCallText,
                callIndex: request.callIndex,
                callCount: request.callCount,
                isCollapsed: true,
            });
            this.ui.scrollToBottom();
            return;
        }

        const controller = appendMessage(
            this.ui.historyDiv,
            request.text || '',
            'user',
            null,
            null,
            null,
            {
                kind: 'tool-status',
                toolName: request.toolName || '',
                toolStatus: request.status || 'running',
                toolCallText,
                callIndex: request.callIndex,
                callCount: request.callCount,
                toolStatusKey: statusKey,
                isCollapsed: true,
            }
        );

        this.ui.scrollToBottom();
        return controller;
    }

    finalizeActiveStream(state = {}) {
        if (!this.streamingBubble) return;
        let finalText;
        if (state.clearToolCallJson) {
            const split = splitToolCallFromText(state.text || '', { allowPartial: true });
            if (split.hasToolCall) {
                finalText = split.displayText;
            } else if (isToolCallOnlyText(state.text, { allowPartial: true })) {
                finalText = '';
            }
            finalText = finalText || '';
        }
        if (
            state.clearToolCallJson &&
            !hasDisplayableText(finalText) &&
            !hasDisplayableThoughts(state.thoughts)
        ) {
            if (typeof this.streamingBubble.dispose === 'function') {
                this.streamingBubble.dispose();
            }
            if (this.streamingBubble.div && typeof this.streamingBubble.div.remove === 'function') {
                this.streamingBubble.div.remove();
            }
            this.streamingBubble = null;
            return;
        }
        if (typeof this.streamingBubble.finalize === 'function') {
            const finalThoughts = hasDisplayableThoughts(state.thoughts)
                ? state.thoughts
                : undefined;
            this.streamingBubble.finalize(finalText, finalThoughts, {
                suppressCopy: state.clearToolCallJson === true,
            });
        } else if (typeof this.streamingBubble.dispose === 'function') {
            this.streamingBubble.dispose();
        }
        this.streamingBubble = null;
    }

    getStreamToolCallText(sessionId) {
        if (!sessionId) return '';
        const state = this.streamStates.get(sessionId);
        if (typeof state?.toolCallText === 'string' && state.toolCallText.trim()) {
            return state.toolCallText;
        }
        const split = splitToolCallFromText(state?.rawText || state?.text || '', {
            allowPartial: true,
        });
        return split.toolCallText;
    }

    getStreamRawText(sessionId) {
        if (!sessionId) return '';
        const state = this.streamStates.get(sessionId);
        return typeof state?.rawText === 'string' ? state.rawText : state?.text || '';
    }

    getStreamThoughts(sessionId) {
        if (!sessionId) return '';
        const state = this.streamStates.get(sessionId);
        return typeof state?.thoughts === 'string' ? state.thoughts : '';
    }

    getRequestToolCallText(request, sessionId) {
        const requestText = typeof request?.toolCallText === 'string' ? request.toolCallText : '';
        const split = splitToolCallFromText(requestText, { allowPartial: true });
        if (split.hasToolCall) return split.toolCallText;
        if (isToolCallOnlyText(requestText, { allowPartial: true })) return requestText.trim();
        return this.getStreamToolCallText(sessionId);
    }

    hasRenderedToolOutput(key) {
        if (!key || !this.ui || !this.ui.historyDiv) return false;
        return Array.from(this.ui.historyDiv.querySelectorAll('[data-tool-output-key]')).some(
            (element) => element.dataset.toolOutputKey === key
        );
    }

    findRenderedToolStatus(key) {
        if (!key || !this.ui || !this.ui.historyDiv) return null;
        const element = Array.from(
            this.ui.historyDiv.querySelectorAll('[data-tool-status-key]')
        ).find((candidate) => candidate.dataset.toolStatusKey === key);
        return element?.__messageController || null;
    }

    removeRenderedToolStatus(key) {
        const controller = this.findRenderedToolStatus(key);
        if (!controller) return;
        if (typeof controller.dispose === 'function') {
            controller.dispose();
        }
        if (controller.div && typeof controller.div.remove === 'function') {
            controller.div.remove();
        }
    }

    handleImageResult(request) {
        handleImageFetchResult(request, {
            ui: this.ui,
            imageManager: this.imageManager,
        });
    }

    async handleGeneratedImageResult(request) {
        await handleGeneratedImageFetchResult(request);
    }

    async handleCropResult(request) {
        await handleCropScreenshotResult(request, {
            ui: this.ui,
            imageManager: this.imageManager,
            app: this.app,
        });
    }

    handleSelectionResult(request) {
        handleSelectionTextResult(request, { ui: this.ui });
    }

    // Called by AppController on cancel/switch
    resetStream(options = {}) {
        if (this.streamingBubble) {
            if (typeof this.streamingBubble.dispose === 'function') {
                this.streamingBubble.dispose();
            }
            if (options.remove === true && this.streamingBubble.div) {
                this.streamingBubble.div.remove();
            }
            this.streamingBubble = null;
        }
        if (this.contextCompressionNotice && options.remove === true) {
            this.contextCompressionNotice.dispose?.();
        }
        this.contextCompressionNotice = null;
    }

    clearActiveStream() {
        const activeSessionId =
            this.app.generatingSessionId || this.sessionManager.currentSessionId || null;
        this.clearStreamState(activeSessionId);
        this.resetStream({ remove: true });
    }

    restoreStreamForSession(sessionId) {
        if (!sessionId || sessionId !== this.app.generatingSessionId) return;
        const state = this.streamStates.get(sessionId);
        if (!state) return;
        const session = this.sessionManager.getCurrentSession();
        if (this.hasPersistedAiReply(session, state)) {
            this.clearStreamState(sessionId);
            return;
        }

        this.resetStream();
        if (state.contextState === 'compressing') {
            this.contextCompressionNotice = appendContextCompressionNotice(
                this.ui.historyDiv,
                t('contextCompressing')
            );
        }
        this.createStreamingBubble(state);
        this.ui.setLoading(true);
    }
}
