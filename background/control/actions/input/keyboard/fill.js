export async function handleFillElement(handler, { uid, value }) {
    const objectId = await handler.getObjectIdFromUid(uid);

    await handler.waitHelper.execute(async () => {
        // Focus first so browser-level input behavior matches user interaction.
        const info = await handler.cmd('Runtime.callFunctionOn', {
            objectId: objectId,
            functionDeclaration: `function() {
                this.focus();
                return {
                    tagName: this.tagName,
                    isContentEditable: this.isContentEditable
                };
            }`,
            returnByValue: true,
        });

        const { tagName } = info.result.value || {};
        const isSelect = tagName === 'SELECT';

        if (isSelect) {
            await handleSelect(handler, objectId, uid, value);
        } else {
            await handleInput(handler, objectId, value);
        }
    });

    return `Filled element ${uid}`;
}

export async function handleFillForm(handler, { elements = [] }) {
    if (!Array.isArray(elements) || elements.length === 0) {
        return "Error: 'elements' must be a non-empty array.";
    }

    for (const element of elements) {
        if (!element || typeof element.uid !== 'string') {
            return "Error: Each form element requires a 'uid'.";
        }
        if (typeof element.value !== 'string') {
            return "Error: Each form element requires a string 'value'.";
        }
        await handleFillElement(handler, element);
    }

    return `Filled form (${elements.length} elements)`;
}

async function handleSelect(handler, objectId, uid, value) {
    const axNode = handler.snapshotManager.getAXNode(uid);

    const getPropertyValue = (property) => property && property.value;
    const isCombobox =
        axNode &&
        (getPropertyValue(axNode.role) === 'combobox' ||
            getPropertyValue(axNode.role) === 'PopUpButton');

    if (isCombobox) {
        const optionUid = handler.snapshotManager.findDescendant(uid, (node) => {
            const role = getPropertyValue(node.role);
            const name = getPropertyValue(node.name);
            return (role === 'option' || role === 'MenuListOption') && name === value;
        });

        if (optionUid) {
            const optionBackendId = handler.snapshotManager.getBackendNodeId(optionUid);
            if (optionBackendId) {
                try {
                    const { object: optionObj } = await handler.cmd('DOM.resolveNode', {
                        backendNodeId: optionBackendId,
                    });
                    if (optionObj) {
                        await handler.cmd('Runtime.callFunctionOn', {
                            objectId: objectId,
                            arguments: [{ objectId: optionObj.objectId }],
                            functionDeclaration: `function(option) {
                                if (option && !option.disabled) {
                                    this.value = option.value;
                                    this.dispatchEvent(new Event('input', { bubbles: true }));
                                    this.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            }`,
                        });
                        return;
                    }
                } catch (error) {
                    console.warn('AXTree option resolution failed, falling back to JS', error);
                }
            }
        }
    }

    // Fall back to JS simulation if AXTree lookup failed.
    await handler.cmd('Runtime.callFunctionOn', {
        objectId: objectId,
        functionDeclaration: `function(targetValue) {
            let found = false;
            for (let i = 0; i < this.options.length; i++) {
                if (this.options[i].value === targetValue) {
                    this.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (!found) {
                for (let i = 0; i < this.options.length; i++) {
                    if (this.options[i].text === targetValue) {
                        this.selectedIndex = i;
                        found = true;
                        break;
                    }
                }
            }
            if (!found) this.value = targetValue;

            this.dispatchEvent(new Event('input', { bubbles: true }));
            this.dispatchEvent(new Event('change', { bubbles: true }));
            this.dispatchEvent(new Event('click', { bubbles: true }));
        }`,
        arguments: [{ value: value }],
    });
}

async function handleInput(handler, objectId, value) {
    // Use trusted CDP input events for maximum compatibility with app frameworks.
    await handler.cmd('Runtime.callFunctionOn', {
        objectId: objectId,
        functionDeclaration: `function() {
            this.focus();
            if (this.select) {
                this.select();
            } else if (window.getSelection) {
                const range = document.createRange();
                range.selectNodeContents(this);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }`,
    });

    // Sending key events ensures frameworks detect the deletion
    await handler.cmd('Input.dispatchKeyEvent', {
        type: 'keyDown',
        windowsVirtualKeyCode: 8,
        nativeVirtualKeyCode: 8,
        key: 'Backspace',
        code: 'Backspace',
    });
    await handler.cmd('Input.dispatchKeyEvent', {
        type: 'keyUp',
        windowsVirtualKeyCode: 8,
        nativeVirtualKeyCode: 8,
        key: 'Backspace',
        code: 'Backspace',
    });

    // Input.insertText simulates typing (fires input events automatically)
    if (value) {
        await handler.cmd('Input.insertText', { text: value });
    }

    // Some browsers only fire change on blur, so dispatch it explicitly.
    await handler.cmd('Runtime.callFunctionOn', {
        objectId: objectId,
        functionDeclaration: `function() {
            this.dispatchEvent(new Event('change', { bubbles: true }));
        }`,
    });
}
