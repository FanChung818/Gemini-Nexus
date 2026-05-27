import { renderContent } from './content.js';
import { createCopyButton } from './copy_button.js';
import { createMessageEditControl } from './message_edit.js';
import { createGeneratedImagesGrid, createUserImagesGrid } from './message_media.js';
import { getMessageSpacingKind, isToolMessageKind, syncMessageSpacing } from './message_spacing.js';
import { cleanupStructuredSourceText, createSourcesElement } from './sources.js';
import { createThoughtsBlock } from './thoughts_block.js';
import { hasDisplayableText } from '../core/displayable_content.js';

const ASSISTANT_AVATAR_SRC = new URL('../../assets/assistant-avatar.png', import.meta.url).href;

// Appends a message to the chat history and returns an update controller
// attachment can be:
// - string: single user image (URL/Base64)
// - array of strings: multiple user images
// - array of objects {url, alt}: generated-image objects
export function appendMessage(
    container,
    text,
    role,
    attachment = null,
    thoughts = null,
    sources = null,
    options = {}
) {
    const messageElement = document.createElement('div');
    messageElement.className = `msg ${role}`;
    messageElement.dataset.messageRole = role === 'ai' ? 'model' : role;
    if (options.kind) messageElement.classList.add(`msg-${options.kind}`);
    if (options.toolOutputKey) messageElement.dataset.toolOutputKey = options.toolOutputKey;
    if (options.toolStatusKey) messageElement.dataset.toolStatusKey = options.toolStatusKey;
    const isNormalMessage = !isToolMessageKind(options.kind);
    const contentHost = isNormalMessage ? document.createElement('div') : messageElement;
    let actionsHost = null;

    if (isNormalMessage) {
        const row = document.createElement('div');
        row.className = 'msg-row';

        contentHost.className = 'message-content-container';
        actionsHost = createMessageActionRail(role);

        if (role === 'user') {
            row.appendChild(contentHost);
            row.appendChild(actionsHost);
        } else {
            row.appendChild(actionsHost);
            row.appendChild(contentHost);
        }

        messageElement.appendChild(row);
    }

    let currentText = text || '';
    let currentThoughts = thoughts || '';

    // User-uploaded images render before message text.
    if (role === 'user' && attachment) {
        const imagesContainer = createUserImagesGrid(attachment);
        if (imagesContainer) {
            contentHost.appendChild(imagesContainer);
        }
    }

    let contentDiv = null;
    let thoughtsController = null;
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

    const syncRenderOptions = (state = {}) => {
        if (state.isStreaming !== undefined) {
            options.isStreaming = state.isStreaming === true;
        }
        if (state.isFinal !== undefined) {
            options.isFinal = state.isFinal === true;
        }
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
        return getMessageSpacingKind({
            kind: options.kind,
            role,
            thoughts: currentThoughts,
            visibleText: getVisibleMessageText(),
        });
    };

    const syncCompactSpacing = ({ skipNext = false } = {}) => {
        syncMessageSpacing(container, messageElement, getSpacingKind, { skipNext });
    };

    const syncCopyButton = () => {
        const shouldShowCopy = hasCopyableMessageText();
        if (shouldShowCopy && !copyBtn) {
            copyBtn = createCopyButton(getCopyText);
            getMessageActionsHost()?.appendChild(copyBtn);
            return;
        }
        if (!shouldShowCopy && copyBtn) {
            copyBtn.remove();
            copyBtn = null;
        }
    };

    const updateThoughts = (nextThoughts, state = {}) => {
        if (nextThoughts !== undefined) {
            currentThoughts = nextThoughts || '';
        }

        thoughtsController?.update(nextThoughts, state);
        syncCompactSpacing();
    };

    // Allow creating empty AI bubbles for streaming
    if (currentText || currentThoughts || role === 'ai' || role === 'user') {
        if (role === 'ai') {
            thoughtsController = createThoughtsBlock(currentThoughts, options, syncCompactSpacing);
            contentHost.appendChild(thoughtsController.root);
            updateThoughts(undefined, {
                isStreaming: options.isStreaming,
                isFinal: options.isFinal,
            });
        }

        contentDiv = document.createElement('div');
        contentDiv.className = 'msg-content';
        renderMessageContent();
        contentHost.appendChild(contentDiv);

        if (role === 'ai' && Array.isArray(sources) && sources.length > 0) {
            sourcesDiv = createSourcesElement(sources);
            if (sourcesDiv) {
                contentHost.appendChild(sourcesDiv);
            }
        }

        // AI-generated images are distinct from user attachments.
        if (role === 'ai') {
            const grid = createGeneratedImagesGrid(attachment);
            if (grid) contentHost.appendChild(grid);
        }

        syncCopyButton();
        syncCompactSpacing();

        if (
            role === 'user' &&
            !isToolMessageKind(options.kind) &&
            typeof options.onEdit === 'function'
        ) {
            editController = createMessageEditControl({
                messageEl: messageElement,
                contentEl: contentDiv,
                editorHost: contentHost,
                getCopyButton: () => copyBtn,
                getCurrentText: () => currentText,
                onEdit: options.onEdit,
            });

            getMessageActionsHost()?.appendChild(editController.button);
        }
    }

    container.appendChild(messageElement);
    syncCompactSpacing();

    // Instead of scrolling to bottom, we scroll to the top of the NEW message.
    // This allows users to read from the start while content streams in below.
    // Restored history renders disable this and let the session flow choose one
    // final scroll position after all messages are rebuilt.
    if (options.autoScroll !== false) {
        setTimeout(() => {
            const topPos = messageElement.offsetTop - 20; // 20px padding context
            container.scrollTo({
                top: topPos,
                behavior: 'smooth',
            });
        }, 10);
    }

    const controller = {
        div: messageElement,
        update: (newText, newThoughts, state = {}) => {
            syncRenderOptions(state);
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
            syncRenderOptions({
                ...state,
                isStreaming: false,
                isFinal: true,
            });
            if (newText !== undefined) {
                currentText = newText;
                if (state.suppressCopy !== undefined) {
                    options.suppressCopy = state.suppressCopy === true;
                }
                renderMessageContent();
                syncCopyButton();
            }
            if (Number.isFinite(state.thoughtsDurationSeconds)) {
                thoughtsController?.setDurationSeconds(state.thoughtsDurationSeconds);
            }
            updateThoughts(newThoughts, { isFinal: true });
            syncCompactSpacing();
        },
        syncCompactSpacing,
        getThoughtsDurationSeconds: () => thoughtsController?.getDurationSeconds() ?? null,
        dispose: () => {
            thoughtsController?.dispose();
            editController?.cancel();
        },
        addImages: (images) => {
            if (
                Array.isArray(images) &&
                images.length > 0 &&
                !contentHost.querySelector('.generated-images-grid')
            ) {
                const grid = createGeneratedImagesGrid(images);
                if (!grid) return;

                contentHost.appendChild(grid);
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
            contentHost.appendChild(sourcesDiv);
        },
    };
    messageElement.__messageController = controller;
    return controller;

    function getMessageActionsHost() {
        return actionsHost?.querySelector('.message-actions') || messageElement;
    }
}

function createMessageActionRail(role) {
    const rail = document.createElement('div');
    rail.className = 'message-action-rail';

    const avatar = document.createElement('div');
    avatar.className = `message-avatar message-avatar-${role === 'ai' ? 'ai' : 'user'}`;
    avatar.setAttribute('aria-hidden', 'true');

    if (role === 'ai') {
        const image = document.createElement('img');
        image.src = ASSISTANT_AVATAR_SRC;
        image.alt = '';
        image.width = 29;
        image.height = 29;
        avatar.appendChild(image);
    } else {
        avatar.innerHTML = `
            <svg viewBox="0 0 24 24" width="29" height="29" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M20 21a8 8 0 0 0-16 0"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
    }

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    rail.appendChild(avatar);
    rail.appendChild(actions);
    return rail;
}
