const UNGROUPED_TOOLS_KEY = '(other)';

function createHelpText(text) {
    const div = document.createElement('div');
    div.style.opacity = '0.85';
    div.style.fontSize = '12px';
    div.textContent = text;
    return div;
}

export function getMcpToolsSummaryText({ server, tools, toolMode, enabledSet }) {
    const total = Array.isArray(tools) ? tools.length : 0;
    const enabledCount = toolMode === 'all' ? total : enabledSet.size;
    const modeLabel = toolMode === 'all' ? 'all' : 'selected';

    if (!server.url || !server.url.trim()) {
        return 'Set Server URL to manage tools.';
    }
    if (total === 0) {
        return toolMode === 'all'
            ? 'All tools will be exposed. Click "Refresh Tools" to preview the tool list.'
            : 'No tool list loaded. Click "Refresh Tools" to load tools, then select which to expose.';
    }
    return `Mode: ${modeLabel}. Tools exposed: ${enabledCount}/${total}.`;
}

export function groupMcpTools(tools, search = '') {
    const normalizedSearch = (search || '').trim().toLowerCase();
    const filtered = normalizedSearch
        ? tools.filter(
              (tool) =>
                  (tool.name || '').toLowerCase().includes(normalizedSearch) ||
                  (tool.description || '').toLowerCase().includes(normalizedSearch)
          )
        : tools;
    const groups = new Map();

    for (const tool of filtered) {
        const toolName = tool.name || '';
        if (!toolName) continue;
        const dot = toolName.indexOf('.');
        const group = dot > 0 ? toolName.slice(0, dot) : UNGROUPED_TOOLS_KEY;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(tool);
    }

    return Array.from(groups.keys())
        .sort((a, b) => {
            if (a === UNGROUPED_TOOLS_KEY) return 1;
            if (b === UNGROUPED_TOOLS_KEY) return -1;
            return a.localeCompare(b);
        })
        .map((name) => ({
            name,
            tools: groups.get(name).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        }));
}

function renderToolRow(tool, enabledSet, onToolsChange) {
    const toolName = tool.name || '';
    const dot = toolName.indexOf('.');
    const displayName = dot > 0 ? toolName.slice(dot + 1) : toolName;

    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'flex-start';
    row.style.gap = '8px';
    row.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabledSet.has(toolName);
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) enabledSet.add(toolName);
        else enabledSet.delete(toolName);
        onToolsChange(Array.from(enabledSet));
    });

    const text = document.createElement('div');
    text.style.display = 'flex';
    text.style.flexDirection = 'column';
    text.style.gap = '2px';

    const nameEl = document.createElement('div');
    nameEl.style.fontSize = '12px';
    nameEl.style.fontWeight = '500';
    nameEl.textContent = displayName;

    const fullEl = document.createElement('div');
    fullEl.style.fontSize = '11px';
    fullEl.style.opacity = '0.7';
    fullEl.textContent = toolName;

    const descEl = document.createElement('div');
    descEl.style.fontSize = '11px';
    descEl.style.opacity = '0.85';
    descEl.textContent = tool.description || '';

    text.appendChild(nameEl);
    text.appendChild(fullEl);
    if (tool.description) text.appendChild(descEl);

    row.appendChild(checkbox);
    row.appendChild(text);
    return row;
}

function renderToolGroup(groupName, tools, enabledSet, uiState, onToolsChange) {
    const toolNames = tools.map((tool) => tool.name).filter(Boolean);
    const enabledCountInGroup = toolNames.filter((name) => enabledSet.has(name)).length;
    const totalInGroup = toolNames.length;

    const details = document.createElement('details');
    details.open = uiState.openGroups.has(groupName);
    details.addEventListener('toggle', () => {
        if (details.open) uiState.openGroups.add(groupName);
        else uiState.openGroups.delete(groupName);
    });

    const summary = document.createElement('summary');
    summary.style.cursor = 'pointer';
    summary.style.userSelect = 'none';
    summary.style.display = 'flex';
    summary.style.alignItems = 'center';
    summary.style.justifyContent = 'space-between';
    summary.style.gap = '10px';
    summary.style.padding = '6px 8px';
    summary.style.background = 'rgba(0,0,0,0.04)';
    summary.style.borderRadius = '8px';
    summary.style.listStyle = 'none';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';

    const groupCheckbox = document.createElement('input');
    groupCheckbox.type = 'checkbox';
    groupCheckbox.checked = totalInGroup > 0 && enabledCountInGroup === totalInGroup;
    groupCheckbox.indeterminate = enabledCountInGroup > 0 && enabledCountInGroup < totalInGroup;
    groupCheckbox.addEventListener('click', (event) => {
        event.stopPropagation();
    });
    groupCheckbox.addEventListener('change', () => {
        if (groupCheckbox.checked) {
            for (const name of toolNames) enabledSet.add(name);
        } else {
            for (const name of toolNames) enabledSet.delete(name);
        }
        onToolsChange(Array.from(enabledSet));
    });

    const groupTitle = document.createElement('div');
    groupTitle.style.fontSize = '12px';
    groupTitle.style.fontWeight = '600';
    groupTitle.textContent = groupName === UNGROUPED_TOOLS_KEY ? 'Other tools' : groupName;

    left.appendChild(groupCheckbox);
    left.appendChild(groupTitle);

    const right = document.createElement('div');
    right.style.fontSize = '12px';
    right.style.opacity = '0.85';
    right.textContent = `${enabledCountInGroup}/${totalInGroup}`;

    summary.appendChild(left);
    summary.appendChild(right);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';
    list.style.padding = '8px 2px 2px 2px';

    for (const tool of tools) {
        list.appendChild(renderToolRow(tool, enabledSet, onToolsChange));
    }

    details.appendChild(summary);
    details.appendChild(list);
    return details;
}

export function renderMcpToolsUI({
    server,
    tools,
    search,
    summaryElement,
    listElement,
    uiState,
    onToolsChange,
}) {
    const toolMode = server.toolMode === 'selected' ? 'selected' : 'all';
    const enabledSet = new Set(Array.isArray(server.enabledTools) ? server.enabledTools : []);
    const cached = Array.isArray(tools) ? tools : [];

    summaryElement.textContent = getMcpToolsSummaryText({
        server,
        tools: cached,
        toolMode,
        enabledSet,
    });

    listElement.innerHTML = '';

    if (toolMode === 'all') {
        listElement.appendChild(
            createHelpText(
                'Switch to "Selected tools only" to choose which tools the model can use.'
            )
        );
        return;
    }

    if (cached.length === 0) {
        listElement.appendChild(createHelpText('No tools loaded yet.'));
        return;
    }

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';

    const handleToolsChange = (enabledTools) => {
        server.enabledTools = enabledTools;
        onToolsChange();
    };

    for (const group of groupMcpTools(cached, search)) {
        container.appendChild(
            renderToolGroup(group.name, group.tools, enabledSet, uiState, handleToolsChange)
        );
    }

    listElement.appendChild(container);
}
