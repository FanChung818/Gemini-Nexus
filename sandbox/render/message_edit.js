import { t } from '../core/i18n.js';

const EDIT_ICON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
const SAVE_ICON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

export function createMessageEditControl({
    messageEl,
    contentEl,
    getCopyButton,
    getCurrentText,
    onEdit,
}) {
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.title = t('editMessage');
    editBtn.setAttribute('aria-label', t('editMessage'));
    editBtn.innerHTML = EDIT_ICON;

    let cancelActiveEdit = null;

    editBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (cancelActiveEdit) return;

        messageEl.classList.add('editing');
        contentEl.style.display = 'none';
        const copyBtn = getCopyButton();
        if (copyBtn) copyBtn.style.display = 'none';
        editBtn.style.display = 'none';

        const editor = document.createElement('div');
        editor.className = 'message-edit';

        const textarea = document.createElement('textarea');
        textarea.className = 'message-edit-input';
        textarea.value = getCurrentText();
        textarea.rows = Math.max(2, Math.min(8, textarea.value.split('\n').length));

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
        saveBtn.innerHTML = SAVE_ICON;

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        editor.appendChild(textarea);
        editor.appendChild(actions);
        messageEl.insertBefore(editor, getCopyButton() || editBtn);

        const cleanup = () => {
            document.removeEventListener('pointerdown', handleOutsidePointer, true);
            document.removeEventListener('keydown', handleDocumentKey, true);
            editor.remove();
            contentEl.style.display = '';
            const nextCopyBtn = getCopyButton();
            if (nextCopyBtn) nextCopyBtn.style.display = '';
            editBtn.style.display = '';
            messageEl.classList.remove('editing');
            cancelActiveEdit = null;
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
                const accepted = await onEdit(nextText);
                if (accepted !== false) {
                    cleanup();
                    return;
                }
            } catch (error) {
                console.error('Failed to edit message:', error);
            } finally {
                isSaving = false;
                saveBtn.disabled = false;
            }
        };

        function handleOutsidePointer(pointerEvent) {
            if (!messageEl.contains(pointerEvent.target)) {
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

        cancelActiveEdit = cancel;

        setTimeout(() => {
            document.addEventListener('pointerdown', handleOutsidePointer, true);
            document.addEventListener('keydown', handleDocumentKey, true);
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            textarea.dispatchEvent(new Event('input'));
        }, 0);
    });

    return {
        button: editBtn,
        cancel: () => {
            if (cancelActiveEdit) cancelActiveEdit();
        },
    };
}
