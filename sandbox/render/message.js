// sandbox/render/message.js
import { renderContent } from './content.js';
import { createCopyButton } from './copy_button.js';
import { createGeneratedImagesGrid, createUserImagesGrid } from './message_media.js';
import { cleanupStructuredSourceText, createSourcesElement } from './sources.js';
import { t } from '../core/i18n.js';

const THOUGHTS_REGION_PREFIX = 'thoughts-content';
const TOOL_MESSAGE_KINDS = new Set(['tool-output', 'tool-status']);

function formatThoughtDuration(seconds) {
    if (!Number.isFinite(seconds)) return null;
    if (seconds > 0 && seconds < 1) return '1';
    return String(Math.max(0, Math.round(seconds)));
}

function hasDisplayableThoughts(thoughts) {
    return typeof thoughts === 'string' ? thoughts.trim().length > 0 : Boolean(thoughts);
}

function hasDisplayableText(text) {
    return typeof text === 'string' ? text.trim().length > 0 : Boolean(text);
}

function isToolMessageKind(kind) {
    return TOOL_MESSAGE_KINDS.has(kind);
}

function getThoughtsStartedAtFromOptions(options) {
    if (Number.isFinite(options.thoughtsStartedAt)) {
        return options.thoughtsStartedAt;
    }
    if (Number.isFinite(options.thoughtsElapsedSeconds)) {
        return Date.now() - Math.max(0, options.thoughtsElapsedSeconds) * 1000;
    }
    return null;
}

export function appendContextCompressionNotice(container, text, options = {}) {
    const div = document.createElement('div');
    div.className = 'context-compression-notice';
    div.setAttribute('role', 'status');

    const lineStart = document.createElement('span');
    lineStart.className = 'context-compression-line';

    const label = document.createElement('span');
    label.className = 'context-compression-label';

    const icon = document.createElement('span');
    icon.className = 'context-compression-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 12h4"></path><path d="M10 16h4"></path></svg>';

    const textSpan = document.createElement('span');
    textSpan.className = 'context-compression-text';
    textSpan.textContent = text;

    const lineEnd = document.createElement('span');
    lineEnd.className = 'context-compression-line';

    label.appendChild(icon);
    label.appendChild(textSpan);
    div.appendChild(lineStart);
    div.appendChild(label);
    div.appendChild(lineEnd);
    if (options.complete) {
        div.classList.add('context-compression-complete');
    }
    container.appendChild(div);

    if (options.scroll !== false) {
        setTimeout(() => {
            container.scrollTo({
                top: div.offsetTop - 20,
                behavior: 'smooth',
            });
        }, 10);
    }

    return {
        div,
        update: (nextText) => {
            textSpan.textContent = nextText;
            div.classList.add('context-compression-complete');
        },
        dispose: () => {
            div.remove();
        },
    };
}

// Appends a message to the chat history and returns an update controller
// attachment can be:
// - string: single user image (URL/Base64)
// - array of strings: multiple user images
// - array of objects {url, alt}: AI generated images
export function appendMessage(
    container,
    text,
    role,
    attachment = null,
    thoughts = null,
    sources = null,
    options = {}
) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    if (options.kind) div.classList.add(`msg-${options.kind}`);
    if (options.toolOutputKey) div.dataset.toolOutputKey = options.toolOutputKey;
    if (options.toolStatusKey) div.dataset.toolStatusKey = options.toolStatusKey;

    // Store current text state
    let currentText = text || '';
    let currentThoughts = thoughts || '';

    // 1. User Uploaded Images
    if (role === 'user' && attachment) {
        const imagesContainer = createUserImagesGrid(attachment);
        if (imagesContainer) {
            div.appendChild(imagesContainer);
        }
    }

    let contentDiv = null;
    let thoughtsDiv = null;
    let thoughtsToggle = null;
    let thoughtsStatus = null;
    let thoughtsContent = null;
    let thoughtsStartedAt = getThoughtsStartedAtFromOptions(options);
    let thoughtsDurationSeconds = Number.isFinite(options.thoughtsDurationSeconds)
        ? options.thoughtsDurationSeconds
        : null;
    let thoughtsExpanded = false;
    let thoughtsFinished = Boolean(options.isFinal);
    let thoughtsStatusTimer = null;
    let sourcesDiv = null;
    let editCancel = null;
    let copyBtn = null;
    let currentSources = Array.isArray(sources) ? sources : [];

    const renderMessageContent = () => {
        if (!contentDiv) return;
        const renderRole = isToolMessageKind(options.kind) ? options.kind : role;
        const displayText =
            renderRole === 'ai'
                ? cleanupStructuredSourceText(currentText, currentSources)
                : currentText;
        const hideEmptyAiContent = renderRole === 'ai' && !hasDisplayableText(displayText);
        contentDiv.hidden = hideEmptyAiContent;
        if (hideEmptyAiContent) {
            contentDiv.innerHTML = '';
            return;
        }
        renderContent(contentDiv, displayText, renderRole, options);
    };

    const getVisibleMessageText = () => {
        return role === 'ai'
            ? cleanupStructuredSourceText(currentText, currentSources)
            : currentText;
    };

    const hasCopyableMessageText = () => {
        if (isToolMessageKind(options.kind)) return false;
        if (options.suppressCopy === true) return false;
        return hasDisplayableText(getVisibleMessageText());
    };

    const getCopyText = () => {
        return getVisibleMessageText();
    };

    const getSpacingKind = () => {
        if (isToolMessageKind(options.kind)) return 'tool';
        const displayText = getVisibleMessageText();
        if (
            role === 'ai' &&
            hasDisplayableThoughts(currentThoughts) &&
            !hasDisplayableText(displayText)
        ) {
            return 'thinking';
        }
        return 'normal';
    };

    const isCompactSpacingPair = (previousKind, currentKind) => {
        if (!previousKind || !currentKind) return false;
        if (previousKind === 'tool' && currentKind === 'tool') return true;
        return (
            (previousKind === 'thinking' && currentKind === 'tool') ||
            (previousKind === 'tool' && currentKind === 'thinking')
        );
    };

    const syncCompactSpacing = ({ skipNext = false } = {}) => {
        if (!container.contains(div)) return;
        const spacingKind = getSpacingKind();
        div.dataset.messageSpacingKind = spacingKind;
        div.classList.toggle('msg-thinking-only', spacingKind === 'thinking');

        const previousKind = div.previousElementSibling?.dataset?.messageSpacingKind || '';
        div.classList.toggle('msg-compact-chain', isCompactSpacingPair(previousKind, spacingKind));

        if (skipNext) return;
        const nextController = div.nextElementSibling?.__messageController;
        if (nextController && typeof nextController.syncCompactSpacing === 'function') {
            nextController.syncCompactSpacing({ skipNext: true });
        }
    };

    const syncCopyButton = () => {
        const shouldShowCopy = hasCopyableMessageText();
        if (shouldShowCopy && !copyBtn) {
            copyBtn = createCopyButton(getCopyText);
            div.appendChild(copyBtn);
            return;
        }
        if (!shouldShowCopy && copyBtn) {
            copyBtn.remove();
            copyBtn = null;
        }
    };

    const getThoughtsCompleteLabel = () => {
        if (thoughtsDurationSeconds !== null) {
            return t('thoughtsCompleteWithDuration').replace(
                '{seconds}',
                formatThoughtDuration(thoughtsDurationSeconds)
            );
        }
        return t('thoughtsComplete');
    };

    const getThoughtsStreamingLabel = () => {
        if (!thoughtsStartedAt) return t('thoughtsStreaming');
        const elapsedSeconds = (Date.now() - thoughtsStartedAt) / 1000;
        return t('thoughtsCompleteWithDuration').replace(
            '{seconds}',
            formatThoughtDuration(elapsedSeconds)
        );
    };

    const updateThoughtsStatus = (isStreaming) => {
        if (!thoughtsStatus) return;
        thoughtsStatus.textContent = isStreaming
            ? getThoughtsStreamingLabel()
            : getThoughtsCompleteLabel();
    };

    const stopThoughtsStatusTimer = () => {
        if (!thoughtsStatusTimer) return;
        clearInterval(thoughtsStatusTimer);
        thoughtsStatusTimer = null;
    };

    const startThoughtsStatusTimer = () => {
        if (thoughtsStatusTimer) return;
        thoughtsStatusTimer = setInterval(() => {
            if (thoughtsFinished) {
                stopThoughtsStatusTimer();
                return;
            }
            updateThoughtsStatus(true);
        }, 1000);
    };

    const setThoughtsExpanded = (expanded) => {
        if (!thoughtsToggle || !thoughtsContent || !thoughtsDiv) return;
        expanded = Boolean(expanded);
        thoughtsExpanded = expanded;
        thoughtsDiv.classList.toggle('thoughts-expanded', expanded);
        thoughtsToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        thoughtsToggle.setAttribute(
            'aria-label',
            expanded ? t('thoughtsCollapse') : t('thoughtsExpand')
        );
        thoughtsContent.hidden = !expanded;
    };

    const setThoughtsVisible = (visible) => {
        if (!thoughtsDiv) return;
        thoughtsDiv.hidden = !visible;
    };

    const finishThoughts = () => {
        if (thoughtsFinished) {
            return;
        }
        thoughtsFinished = true;
        thoughtsDurationSeconds = thoughtsStartedAt
            ? (Date.now() - thoughtsStartedAt) / 1000
            : (thoughtsDurationSeconds ?? 0);
        stopThoughtsStatusTimer();
        setThoughtsExpanded(false);
    };

    const updateThoughts = (nextThoughts, state = {}) => {
        if (!thoughtsContent) return;

        if (nextThoughts !== undefined) {
            currentThoughts = nextThoughts || '';
            renderContent(thoughtsContent, currentThoughts, 'ai');
        }

        const hasThoughts = hasDisplayableThoughts(currentThoughts);
        setThoughtsVisible(hasThoughts);
        if (!hasThoughts) {
            stopThoughtsStatusTimer();
            syncCompactSpacing();
            return;
        }

        if (state.isFinal || state.hasDisplayableText) {
            finishThoughts();
            updateThoughtsStatus(false);
            syncCompactSpacing();
            return;
        }

        if (state.isStreaming && !thoughtsFinished) {
            if (!thoughtsStartedAt) {
                thoughtsStartedAt = getThoughtsStartedAtFromOptions(state) || Date.now();
            }
            updateThoughtsStatus(true);
            startThoughtsStatusTimer();
            setThoughtsExpanded(true);
            syncCompactSpacing();
            return;
        }

        stopThoughtsStatusTimer();
        updateThoughtsStatus(false);
        syncCompactSpacing();
    };

    // Allow creating empty AI bubbles for streaming
    if (currentText || currentThoughts || role === 'ai' || role === 'user') {
        // --- Thinking Process (Optional) ---
        if (role === 'ai') {
            thoughtsDiv = document.createElement('div');
            thoughtsDiv.className = 'thoughts-container';
            thoughtsDiv.hidden = !hasDisplayableThoughts(currentThoughts);

            const regionId = `${THOUGHTS_REGION_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

            thoughtsToggle = document.createElement('button');
            thoughtsToggle.type = 'button';
            thoughtsToggle.className = 'thoughts-toggle';
            thoughtsToggle.setAttribute('aria-controls', regionId);

            const arrow = document.createElement('span');
            arrow.className = 'thoughts-arrow';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '›';

            thoughtsStatus = document.createElement('span');
            thoughtsStatus.className = 'thoughts-status';

            thoughtsContent = document.createElement('div');
            thoughtsContent.id = regionId;
            thoughtsContent.className = 'thoughts-content';
            renderContent(thoughtsContent, currentThoughts || '', 'ai');

            thoughtsToggle.appendChild(arrow);
            thoughtsToggle.appendChild(thoughtsStatus);
            thoughtsToggle.addEventListener('click', () => {
                setThoughtsExpanded(!thoughtsExpanded);
            });

            thoughtsDiv.appendChild(thoughtsToggle);
            thoughtsDiv.appendChild(thoughtsContent);
            div.appendChild(thoughtsDiv);
            setThoughtsExpanded(options.isStreaming && hasDisplayableThoughts(currentThoughts));
            updateThoughts(undefined, {
                isStreaming: options.isStreaming,
                isFinal: options.isFinal,
            });
        }

        contentDiv = document.createElement('div');
        contentDiv.className = 'msg-content';
        renderMessageContent();
        div.appendChild(contentDiv);

        if (role === 'ai' && Array.isArray(sources) && sources.length > 0) {
            sourcesDiv = createSourcesElement(sources);
            if (sourcesDiv) {
                div.appendChild(sourcesDiv);
            }
        }

        // 2. AI Generated Images (Array of objects {url, alt})
        // Note: AI images are distinct from user attachments
        if (role === 'ai') {
            const grid = createGeneratedImagesGrid(attachment);
            if (grid) div.appendChild(grid);
        }

        syncCopyButton();
        syncCompactSpacing();

        if (
            role === 'user' &&
            !isToolMessageKind(options.kind) &&
            typeof options.onEdit === 'function'
        ) {
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.title = t('editMessage');
            editBtn.setAttribute('aria-label', t('editMessage'));
            editBtn.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';

            editBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (editCancel) return;

                div.classList.add('editing');
                contentDiv.style.display = 'none';
                if (copyBtn) copyBtn.style.display = 'none';
                editBtn.style.display = 'none';

                const editor = document.createElement('div');
                editor.className = 'message-edit';

                const textarea = document.createElement('textarea');
                textarea.className = 'message-edit-input';
                textarea.value = currentText;
                textarea.rows = Math.max(2, Math.min(8, currentText.split('\n').length));

                const actions = document.createElement('div');
                actions.className = 'message-edit-actions';

                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'message-edit-cancel';
                cancelBtn.textContent = t('cancelEdit');
                cancelBtn.title = t('cancelEdit');

                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.className = 'message-edit-save';
                saveBtn.title = t('saveEdit');
                saveBtn.setAttribute('aria-label', t('saveEdit'));
                saveBtn.innerHTML =
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

                actions.appendChild(cancelBtn);
                actions.appendChild(saveBtn);
                editor.appendChild(textarea);
                editor.appendChild(actions);
                div.insertBefore(editor, copyBtn || editBtn);

                const cleanup = () => {
                    document.removeEventListener('pointerdown', handleOutsidePointer, true);
                    document.removeEventListener('keydown', handleDocumentKey, true);
                    editor.remove();
                    contentDiv.style.display = '';
                    if (copyBtn) copyBtn.style.display = '';
                    editBtn.style.display = '';
                    div.classList.remove('editing');
                    editCancel = null;
                };

                const cancel = () => {
                    cleanup();
                };

                let isSaving = false;

                const save = async () => {
                    if (isSaving) return;
                    const nextText = textarea.value.trim();
                    isSaving = true;
                    saveBtn.disabled = true;

                    try {
                        const accepted = await options.onEdit(nextText);
                        if (accepted !== false) {
                            cleanup();
                            return;
                        }
                    } catch (err) {
                        console.error('Failed to edit message:', err);
                    } finally {
                        isSaving = false;
                        saveBtn.disabled = false;
                    }
                };

                function handleOutsidePointer(pointerEvent) {
                    if (!div.contains(pointerEvent.target)) {
                        cancel();
                    }
                }

                function handleDocumentKey(keyEvent) {
                    if (keyEvent.key === 'Escape') {
                        keyEvent.preventDefault();
                        cancel();
                    }
                    if ((keyEvent.metaKey || keyEvent.ctrlKey) && keyEvent.key === 'Enter') {
                        keyEvent.preventDefault();
                        save();
                    }
                }

                cancelBtn.addEventListener('click', (clickEvent) => {
                    clickEvent.preventDefault();
                    clickEvent.stopPropagation();
                    cancel();
                });

                saveBtn.addEventListener('click', (clickEvent) => {
                    clickEvent.preventDefault();
                    clickEvent.stopPropagation();
                    save();
                });

                textarea.addEventListener('input', () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = `${textarea.scrollHeight}px`;
                });

                editCancel = cancel;

                setTimeout(() => {
                    document.addEventListener('pointerdown', handleOutsidePointer, true);
                    document.addEventListener('keydown', handleDocumentKey, true);
                    textarea.focus();
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                    textarea.dispatchEvent(new Event('input'));
                }, 0);
            });

            div.appendChild(editBtn);
        }
    }

    container.appendChild(div);
    syncCompactSpacing();

    // --- Scroll Logic ---
    // Instead of scrolling to bottom, we scroll to the top of the NEW message.
    // This allows users to read from the start while content streams in below.
    // Restored history renders disable this and let the session flow choose one
    // final scroll position after all messages are rebuilt.
    if (options.autoScroll !== false) {
        setTimeout(() => {
            const topPos = div.offsetTop - 20; // 20px padding context
            container.scrollTo({
                top: topPos,
                behavior: 'smooth',
            });
        }, 10);
    }

    // Return controller
    const controller = {
        div,
        update: (newText, newThoughts, state = {}) => {
            if (newText !== undefined) {
                currentText = newText;
                if (state.toolStatus !== undefined) {
                    options.toolStatus = state.toolStatus;
                }
                if (state.isCollapsed !== undefined) {
                    options.isCollapsed = state.isCollapsed;
                }
                if (state.toolCallText !== undefined) {
                    options.toolCallText = state.toolCallText;
                }
                if (state.callIndex !== undefined) {
                    options.callIndex = state.callIndex;
                }
                if (state.callCount !== undefined) {
                    options.callCount = state.callCount;
                }
                if (state.suppressCopy !== undefined) {
                    options.suppressCopy = state.suppressCopy === true;
                }
                renderMessageContent();
                syncCopyButton();
            }

            const displayText = getVisibleMessageText();
            updateThoughts(newThoughts, {
                ...state,
                hasDisplayableText: hasDisplayableText(displayText),
            });
            syncCompactSpacing();

            // Note: We removed the auto-scroll-to-bottom logic here.
            // If the user is at the start of the message, we want them to stay there
            // as the content expands downwards.
        },
        finalize: (newText, newThoughts, state = {}) => {
            if (newText !== undefined) {
                currentText = newText;
                if (state.suppressCopy !== undefined) {
                    options.suppressCopy = state.suppressCopy === true;
                }
                renderMessageContent();
                syncCopyButton();
            }
            if (Number.isFinite(state.thoughtsDurationSeconds)) {
                thoughtsDurationSeconds = state.thoughtsDurationSeconds;
            }
            updateThoughts(newThoughts, { isFinal: true });
            syncCompactSpacing();
        },
        syncCompactSpacing,
        getThoughtsDurationSeconds: () => thoughtsDurationSeconds,
        dispose: () => {
            stopThoughtsStatusTimer();
        },
        // Function to update images if they arrive late (though mostly synchronous in final reply)
        addImages: (images) => {
            if (
                Array.isArray(images) &&
                images.length > 0 &&
                !div.querySelector('.generated-images-grid')
            ) {
                const grid = createGeneratedImagesGrid(images);
                if (!grid) return;

                // Insert before copy button
                div.insertBefore(grid, div.querySelector('.copy-btn'));
                // Do not force scroll here either
            }
        },
        addSources: (sourceList) => {
            if (sourcesDiv || !Array.isArray(sourceList) || sourceList.length === 0) return;
            currentSources = sourceList;
            renderMessageContent();
            syncCopyButton();
            syncCompactSpacing();

            const builtSources = createSourcesElement(sourceList);
            if (!builtSources) return;

            sourcesDiv = builtSources;
            const copyBtn = div.querySelector('.copy-btn');
            if (copyBtn) {
                div.insertBefore(sourcesDiv, copyBtn);
            } else {
                div.appendChild(sourcesDiv);
            }
        },
    };
    div.__messageController = controller;
    return controller;
}
