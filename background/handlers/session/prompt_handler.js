import {
    appendAiMessage,
    appendAiMessageIfDisplayable,
    appendRawMessages,
    appendUserMessage,
    replaceSessionSnapshot,
} from '../../managers/history_manager.js';
import { PromptBuilder } from './prompt/builder.js';
import { ToolExecutor } from './prompt/tool_executor.js';
import {
    createOfficialFunctionResponseMessage,
    createOfficialFunctionResponseParts,
    createOfficialModelMessage,
    hasNativeFunctionCalls,
    parseToolCommand,
    splitToolCallFromText,
} from './utils.js';

// Spaces out looped requests to avoid rate-limit bursts.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REQUEST_CANCELLED_TEXT = 'Request cancelled.';

async function getStoredProvider() {
    const stored = await chrome.storage.local.get(['geminiProvider', 'geminiUseOfficialApi']);
    return stored.geminiProvider || (stored.geminiUseOfficialApi === true ? 'official' : 'web');
}

async function sendRuntimeMessage(message) {
    try {
        await chrome.runtime.sendMessage(message);
    } catch {}
}

function createIntermediateAiResult(result) {
    const split = splitToolCallFromText(result?.text || '');

    return {
        ...result,
        text: split.hasToolCall ? split.displayText : result?.text || '',
        thoughts: result?.thoughts || null,
        thoughtsDurationSeconds: result?.thoughtsDurationSeconds,
        sources: result?.sources || null,
        images: result?.images,
        thoughtSignature: result?.thoughtSignature,
        context: result?.context,
    };
}

function createCopySuppressedIntermediateAiResult(result) {
    const intermediate = createIntermediateAiResult(result);
    return {
        ...intermediate,
        suppressCopy: true,
    };
}

function detectPromptLanguage(text) {
    const value = typeof text === 'string' ? text : '';
    const zhMatches = value.match(/[\u3400-\u9fff]/g) || [];
    if (zhMatches.length >= 2) return 'zh';
    return 'default';
}

function buildLanguageContinuationInstruction(language) {
    if (language === 'zh') {
        return '继续时必须使用简体中文回答，保持与用户原始请求一致的语言。';
    }
    return 'Continue in the same language as the original user request.';
}

function buildToolContinuationPrompt(toolName, output, language) {
    const languageInstruction = buildLanguageContinuationInstruction(language);
    if (language === 'zh') {
        return `工具 ${toolName} 的输出：\n\`\`\`\n${output}\n\`\`\`\n\n${languageInstruction}\n\n继续下一步或确认任务已完成。`;
    }

    return `[Tool Output from ${toolName}]:\n\`\`\`\n${output}\n\`\`\`\n\n${languageInstruction}\n\n(Proceed with the next step or confirm completion)`;
}

export function hasInlinePageSnapshot(output) {
    return typeof output === 'string' && output.includes('## Latest page snapshot');
}

function getBrowserControlTaskTitle(text) {
    const normalized = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return 'Browser control';
    return normalized.length > 28 ? `${normalized.slice(0, 27)}...` : normalized;
}

function getToolResultsFiles(toolResults) {
    return toolResults.flatMap((result) => (Array.isArray(result.files) ? result.files : []));
}

function getPrimaryToolResult(toolResults) {
    return Array.isArray(toolResults) && toolResults.length > 0 ? toolResults[0] : null;
}

function getToolResultOutputForDisplay(toolResult) {
    return typeof toolResult?.output === 'string'
        ? toolResult.output
        : String(toolResult?.output ?? '');
}

function buildTextToolResult(toolResult, outputForModel) {
    if (!toolResult) return null;
    return {
        ...toolResult,
        outputForModel,
        officialResponseParts: null,
        officialResponseBatchId: null,
        results: [toolResult],
    };
}

function buildNativeToolResult(toolResults, responseBatchId) {
    const primary = getPrimaryToolResult(toolResults);
    if (!primary) return null;

    return {
        ...primary,
        outputForModel: getToolResultOutputForDisplay(primary),
        officialResponseParts: createOfficialFunctionResponseParts(toolResults),
        officialResponseBatchId: responseBatchId,
        results: toolResults,
    };
}

function createFunctionResponseBatchId(sessionId, loopCount) {
    return ['official-tools', sessionId || 'no-session', Date.now(), loopCount].join('|');
}

export class PromptHandler {
    constructor(sessionManager, controlManager, mcpManager) {
        this.sessionManager = sessionManager;
        this.controlManager = controlManager;
        this.builder = new PromptBuilder(controlManager, mcpManager);
        this.toolExecutor = new ToolExecutor(controlManager, mcpManager);
        this.activeRun = null;
    }

    cancel() {
        this.cancelActiveRun();
    }

    createCancellationReply(request) {
        return {
            action: 'GEMINI_REPLY',
            sessionId: request?.sessionId || null,
            text: REQUEST_CANCELLED_TEXT,
            status: 'cancelled',
        };
    }

    cancelActiveRun({ notify = false } = {}) {
        const run = this.activeRun;
        if (!run || run.cancelled) return false;

        run.cancelled = true;
        if (notify) {
            sendRuntimeMessage(this.createCancellationReply(run.request));
        }
        return true;
    }

    isRunCancelled(run) {
        return !run || run.cancelled || this.activeRun !== run;
    }

    handle(request, sendResponse) {
        this.cancelActiveRun({ notify: true });

        const run = {
            request,
            cancelled: false,
        };
        this.activeRun = run;

        (async () => {
            const onUpdate = (partialText, partialThoughts) => {
                // Catch errors if receiver (UI) is closed/unavailable
                chrome.runtime
                    .sendMessage({
                        action: 'GEMINI_STREAM_UPDATE',
                        sessionId: request.sessionId || null,
                        text: partialText,
                        thoughts: partialThoughts,
                    })
                    .catch(() => {});
            };

            try {
                if (request.sessionSnapshot) {
                    const provider = await getStoredProvider();
                    if (provider === 'web') {
                        throw new Error('History editing is not supported for Gemini Web Client.');
                    }
                    await replaceSessionSnapshot(request.sessionSnapshot);
                }

                // AUTO-LOCK: If browser control enabled and no tab locked, lock to active tab
                if (request.enableBrowserControl && this.controlManager) {
                    this.controlManager.setOwnerSidePanelTabId(request.sidePanelTabId || null);
                    this.controlManager.setControlTaskTitle(
                        getBrowserControlTaskTitle(request.text)
                    );
                    const currentLock = this.controlManager.getTargetTabId();
                    if (!currentLock) {
                        const tabs = await chrome.tabs.query({
                            active: true,
                            lastFocusedWindow: true,
                        });
                        if (tabs.length > 0) {
                            const tab = tabs[0];
                            this.controlManager.setTargetTab(tab.id);

                            // Notify UI to update the Tab Switcher icon so user knows which tab is locked
                            chrome.runtime
                                .sendMessage({
                                    action: 'TAB_LOCKED',
                                    tabId: request.sidePanelTabId || null,
                                    tab: {
                                        id: tab.id,
                                        title: tab.title,
                                        favIconUrl: tab.favIconUrl,
                                        url: tab.url,
                                        active: tab.active,
                                    },
                                })
                                .catch(() => {});
                        }
                    }
                }

                // Build the user prompt and separate system instruction.
                const buildResult = await this.builder.build(request);
                const systemInstruction = buildResult.systemInstruction;
                let currentPromptText = buildResult.userPrompt;
                let currentHistoryText = request.text;
                const continuationLanguage = detectPromptLanguage(request.text);

                let currentFiles = request.files;

                let loopCount = 0;
                // 0 means unlimited (Infinity). Default to 0 if undefined.
                const reqLoops = request.maxLoops !== undefined ? request.maxLoops : 0;
                const MAX_LOOPS = reqLoops === 0 ? Infinity : reqLoops;

                let keepLooping = true;

                // --- AUTOMATED FEEDBACK LOOP ---
                while (keepLooping && loopCount < MAX_LOOPS) {
                    if (this.isRunCancelled(run)) break;

                    const result = await this.sessionManager.handleSendPrompt(
                        {
                            ...request,
                            text: currentPromptText,
                            historyPromptText: currentHistoryText,
                            systemInstruction: systemInstruction, // Pass system instruction
                            files: currentFiles,
                        },
                        onUpdate
                    );

                    if (this.isRunCancelled(run)) break;

                    if (!result || result.status !== 'success') {
                        // If error, notify UI and break loop
                        if (result) chrome.runtime.sendMessage(result).catch(() => {});
                        break;
                    }

                    let toolResult = null;
                    const toolsEnabled = request.enableBrowserControl || request.enableMcpTools;
                    const pendingNativeCalls = toolsEnabled && hasNativeFunctionCalls(result);
                    const pendingToolCommand =
                        toolsEnabled && !pendingNativeCalls
                            ? parseToolCommand(result.text || '')
                            : null;
                    if (pendingToolCommand && request.sessionId) {
                        await appendAiMessageIfDisplayable(
                            request.sessionId,
                            createCopySuppressedIntermediateAiResult(result)
                        );
                    }

                    if (toolsEnabled) {
                        if (pendingNativeCalls) {
                            const batchId = createFunctionResponseBatchId(
                                request.sessionId,
                                loopCount + 1
                            );
                            const toolResults = await this.toolExecutor.executeFunctionCalls(
                                result.functionCalls,
                                request
                            );
                            toolResult = buildNativeToolResult(toolResults, batchId);
                        } else {
                            const textToolResult = await this.toolExecutor.executeIfPresent(
                                result.text,
                                request,
                                onUpdate
                            );
                            toolResult = buildTextToolResult(
                                textToolResult,
                                textToolResult?.output || ''
                            );
                        }
                    }

                    if (this.isRunCancelled(run)) break;

                    if (toolResult) {
                        // Feed tool output back to the model and continue the loop.
                        loopCount++;
                        const allToolFiles = getToolResultsFiles(
                            toolResult.results || [toolResult]
                        );
                        currentFiles = allToolFiles; // Send new files if any, or clear previous files

                        let outputForModel = toolResult.outputForModel;

                        // Automatically inject the Accessibility Tree if the tool implies a state change.
                        // We skip purely observational tools to save processing/tokens if they don't change state.
                        const skipSnapshotTools = ['take_snapshot', 'list_pages'];

                        if (
                            toolResult.source === 'browser_control' &&
                            request.enableBrowserControl &&
                            this.controlManager &&
                            !skipSnapshotTools.includes(toolResult.toolName) &&
                            !hasInlinePageSnapshot(outputForModel)
                        ) {
                            try {
                                const targetTabId = this.controlManager.getTargetTabId();
                                let urlInfo = '';
                                if (targetTabId) {
                                    try {
                                        const tab = await chrome.tabs.get(targetTabId);
                                        urlInfo = `[Current URL]: ${tab.url}\n`;
                                    } catch {}
                                }

                                const snapshot = await this.controlManager.getSnapshot();
                                if (
                                    snapshot &&
                                    typeof snapshot === 'string' &&
                                    !snapshot.startsWith('Error')
                                ) {
                                    outputForModel += `\n\n${urlInfo}[Updated Page Accessibility Tree]:\n\`\`\`text\n${snapshot}\n\`\`\`\n`;
                                }
                            } catch (error) {
                                console.warn('Auto-snapshot injection failed:', error);
                            }
                        }

                        const isOfficialFunctionResponse =
                            Array.isArray(toolResult.officialResponseParts) &&
                            toolResult.officialResponseParts.length > 0;

                        if (isOfficialFunctionResponse && toolResult.source === 'browser_control') {
                            toolResult.officialResponseParts = createOfficialFunctionResponseParts(
                                (toolResult.results || [toolResult]).map((item) => {
                                    if (
                                        item?.source !== 'browser_control' ||
                                        item.toolName !== toolResult.toolName
                                    ) {
                                        return item;
                                    }
                                    return {
                                        ...item,
                                        output: outputForModel,
                                    };
                                })
                            );
                        }

                        // Format observation for the model. Official native function
                        // calls use functionResponse parts instead of synthetic text.
                        currentPromptText = isOfficialFunctionResponse
                            ? ''
                            : buildToolContinuationPrompt(
                                  toolResult.toolName,
                                  outputForModel,
                                  continuationLanguage
                              );

                        // Save "User" message (Tool Output) to history to keep context in sync
                        // NOTE: We do NOT save the massive auto-snapshot text to the user history to keep the UI clean.
                        if (request.sessionId) {
                            const toolResults = toolResult.results || [toolResult];
                            const toolOutputMessages = [];
                            const toolCallSplit = splitToolCallFromText(result.text || '');
                            const textToolCallText =
                                toolCallSplit.toolCallText || result.text || '';

                            for (const [index, item] of toolResults.entries()) {
                                const itemFiles = Array.isArray(item.files) ? item.files : [];
                                const historyImages = itemFiles.length
                                    ? itemFiles.map((f) => f.base64)
                                    : null;
                                const itemToolCallText = pendingNativeCalls
                                    ? JSON.stringify(
                                          { tool: item.toolName, args: item.args || {} },
                                          null,
                                          2
                                      )
                                    : textToolCallText;
                                const step = loopCount;
                                const callIndex = Number.isFinite(item.callIndex)
                                    ? item.callIndex
                                    : index + 1;
                                const callCount = Number.isFinite(item.callCount)
                                    ? item.callCount
                                    : toolResults.length;
                                const userMsg = `[Tool Output: ${item.toolName}]\n${item.output}\n\n[Proceeding to step ${step}]`;

                                await sendRuntimeMessage({
                                    action: 'TOOL_OUTPUT_MESSAGE',
                                    sessionId: request.sessionId,
                                    toolName: item.toolName,
                                    text: item.output,
                                    images: historyImages,
                                    toolCallText: itemToolCallText,
                                    status: item.status || 'completed',
                                    step,
                                    callIndex,
                                    callCount,
                                });

                                toolOutputMessages.push({
                                    role: 'user',
                                    text: userMsg,
                                    image: historyImages,
                                    kind: 'tool-output',
                                    toolName: item.toolName,
                                    toolStatus: item.status || 'completed',
                                    toolCallText: itemToolCallText,
                                    toolStep: step,
                                    toolCallIndex: callIndex,
                                    toolCallCount: callCount,
                                    officialFunctionResponseBatchId:
                                        toolResult.officialResponseBatchId || null,
                                });
                            }

                            if (isOfficialFunctionResponse) {
                                const officialMessages = [];
                                const officialModelMessage = createOfficialModelMessage(result);
                                const officialResponseMessage =
                                    createOfficialFunctionResponseMessage(toolResults);
                                if (officialModelMessage)
                                    officialMessages.push(officialModelMessage);
                                if (officialResponseMessage) {
                                    officialResponseMessage.officialFunctionResponseBatchId =
                                        toolResult.officialResponseBatchId;
                                    officialMessages.push(officialResponseMessage);
                                }
                                await appendRawMessages(request.sessionId, [
                                    ...officialMessages,
                                    ...toolOutputMessages,
                                ]);
                                currentHistoryText = '';
                            } else {
                                const primaryMessage = toolOutputMessages[0];
                                if (primaryMessage) {
                                    await appendUserMessage(
                                        request.sessionId,
                                        primaryMessage.text,
                                        primaryMessage.image,
                                        {
                                            kind: 'tool-output',
                                            toolName: primaryMessage.toolName,
                                            toolStatus: primaryMessage.toolStatus,
                                            toolCallText: primaryMessage.toolCallText,
                                            toolStep: primaryMessage.toolStep,
                                            toolCallIndex: primaryMessage.toolCallIndex,
                                            toolCallCount: primaryMessage.toolCallCount,
                                        }
                                    );
                                    currentHistoryText = primaryMessage.text;
                                }
                            }
                        }

                        if (isOfficialFunctionResponse) {
                            currentFiles = [];
                            request.officialUserParts = toolResult.officialResponseParts;
                            request.officialFunctionResponseBatchId =
                                toolResult.officialResponseBatchId;
                        } else {
                            request.officialUserParts = null;
                            request.officialFunctionResponseBatchId = null;
                        }

                        // === RATE LIMIT MITIGATION ===
                        // Wait 2-4 seconds before sending the next request.
                        // This prevents "No valid response" errors caused by rapid-fire requests.
                        await delay(2000 + Math.random() * 2000);

                        if (this.isRunCancelled(run)) break;
                    } else {
                        // No tool execution, final answer reached.
                        // Only final replies are persisted and sent as GEMINI_REPLY.
                        // Intermediate tool-call JSON is consumed by the loop and should not
                        // terminate the UI streaming state.
                        if (request.sessionId) {
                            await appendAiMessage(request.sessionId, result);
                        }

                        chrome.runtime.sendMessage(result).catch(() => {});
                        keepLooping = false;
                    }
                }
            } catch (error) {
                console.error('Prompt loop error:', error);
                if (!this.isRunCancelled(run)) {
                    chrome.runtime
                        .sendMessage({
                            action: 'GEMINI_REPLY',
                            sessionId: request.sessionId || null,
                            text: 'Error: ' + error.message,
                            status: 'error',
                        })
                        .catch(() => {});
                }
            } finally {
                if (this.activeRun === run) {
                    this.activeRun = null;
                }
                sendResponse({ status: 'completed' });
            }
        })();
        return true;
    }
}
