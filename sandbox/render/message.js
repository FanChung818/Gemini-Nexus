import { renderContent } from './content.js';
import { createCopyButton } from './copy_button.js';
import { createMessageEditControl } from './message_edit.js';
import { createGeneratedImagesGrid, createUserImagesGrid } from './message_media.js';
import { cleanupStructuredSourceText, createSourcesElement } from './sources.js';
import { hasDisplayableThoughts, hasDisplayableText } from '../core/displayable_content.js';
import { t } from '../core/i18n.js';

const TOOL_MESSAGE_KINDS = new Set(['tool-output', 'tool-status']);

function formatThoughtDuration(seconds) {
    if (!Number.isFinite(seconds)) return null;
    if (seconds > 0 && seconds < 1) return '1';
    return String(Math.max(0, Math.round(seconds)));
}

function isToolMessageKind(kind) {
    return TOOL_MESSAGE_KINDS.has(kind);
}

const THOUGHTS_REGION_PREFIX = 'thoughts-content';

function getThoughtsStartedAtFromOptions(options) {
    if (Number.isFinite(options.thoughtsStartedAt)) {
        return options.thoughtsStartedAt;
    }
    if (Number.isFinite(options.thoughtsElapsedSeconds)) {
        return Date.now() - Math.max(0, options.thoughtsElapsedSeconds) * 1000;
    }
    return null;
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

    // User-uploaded images render before message text.
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
    let editController = null;
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

        // AI-generated images are distinct from user attachments.
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
            editController = createMessageEditControl({
                messageEl: div,
                contentEl: contentDiv,
                getCopyButton: () => copyBtn,
                getCurrentText: () => currentText,
                onEdit: options.onEdit,
            });

            div.appendChild(editController.button);
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
            editController?.cancel();
        },
        // Add generated images if they arrive after the text response.
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
