// background/managers/session/context_manager.js
import { sendOfficialMessage } from '../../../services/providers/official.js';
import { sendOpenAIMessage } from '../../../services/providers/openai_compatible.js';
import { getSessionContextSummary, updateSessionContextSummary } from '../history_manager.js';

const DEFAULT_CONTEXT_MODE = 'summary';
const DEFAULT_RECENT_TURNS = 12;
const MIN_RECENT_TURNS = 1;
const MAX_RECENT_TURNS = 50;
const MAX_SUMMARY_MESSAGE_CHARS = 4000;
const MAX_SUMMARY_TRANSCRIPT_CHARS = 60000;

const SUMMARY_SYSTEM_PROMPT = `You maintain a compact conversation memory for Gemini Nexus.

Update the running summary using the previous summary and the new conversation segment.

Keep durable information only:
- user goals, requirements, preferences, and constraints
- decisions already made
- important facts, file paths, URLs, code identifiers, errors, and fixes
- unresolved tasks or follow-up items

Discard small talk, duplicate details, transient wording, and anything already obsolete.
Return only the updated summary. Use the user's language when possible.`;

function normalizeContextMode(mode) {
    return mode === 'recent' ? 'recent' : DEFAULT_CONTEXT_MODE;
}

function normalizeRecentTurns(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_RECENT_TURNS;
    return Math.min(MAX_RECENT_TURNS, Math.max(MIN_RECENT_TURNS, parsed));
}

function getRecentCutoff(messages, recentTurns) {
    if (!Array.isArray(messages) || messages.length === 0) return 0;

    let userTurns = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === 'user') {
            userTurns++;
            if (userTurns === recentTurns) {
                return i;
            }
        }
    }

    return 0;
}

function compactText(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (value.length <= MAX_SUMMARY_MESSAGE_CHARS) return value;
    return `${value.slice(0, MAX_SUMMARY_MESSAGE_CHARS)}...`;
}

function describeAttachments(message) {
    const markers = [];
    if (Array.isArray(message?.image) && message.image.length > 0) {
        markers.push(`[${message.image.length} image attachment(s)]`);
    }
    if (Array.isArray(message?.generatedImages) && message.generatedImages.length > 0) {
        markers.push(`[${message.generatedImages.length} generated image(s)]`);
    }
    if (Array.isArray(message?.sources) && message.sources.length > 0) {
        markers.push(`[${message.sources.length} source link(s)]`);
    }
    return markers.length > 0 ? ` ${markers.join(' ')}` : '';
}

function formatMessagesForSummary(messages) {
    const lines = [];
    let total = 0;

    for (const message of messages) {
        const role = message?.role === 'ai' ? 'Assistant' : 'User';
        const text = compactText(message?.text);
        const line = `${role}: ${text || '[empty]'}${describeAttachments(message)}`;
        if (total + line.length > MAX_SUMMARY_TRANSCRIPT_CHARS) {
            lines.push('[Transcript truncated for summary budget]');
            break;
        }
        lines.push(line);
        total += line.length;
    }

    return lines.join('\n\n');
}

function buildSummaryPrompt(previousSummary, messages) {
    const prior = previousSummary?.trim() || 'None';
    const transcript = formatMessagesForSummary(messages);

    return `Previous summary:\n${prior}\n\nNew conversation segment:\n${transcript}\n\nUpdated summary:`;
}

function appendSummaryToSystemInstruction(systemInstruction, summary) {
    if (!summary) return systemInstruction || '';

    const block = `[Conversation Summary]\n${summary}`;
    return systemInstruction ? `${systemInstruction}\n\n${block}` : block;
}

async function generateSummary(summaryPrompt, settings, signal) {
    const noop = () => {};

    if (settings.provider === 'official') {
        const response = await sendOfficialMessage(
            summaryPrompt,
            SUMMARY_SYSTEM_PROMPT,
            [],
            {
                baseUrl: settings.officialBaseUrl,
                apiKey: settings.apiKey,
                model: settings.summaryModel || settings.officialModel?.split(',')?.[0]?.trim(),
                configuredModels: settings.officialModel
            },
            null,
            [],
            false,
            signal,
            noop
        );
        return response.text;
    }

    if (settings.provider === 'openai') {
        const response = await sendOpenAIMessage(
            summaryPrompt,
            SUMMARY_SYSTEM_PROMPT,
            [],
            {
                baseUrl: settings.openaiBaseUrl,
                apiKey: settings.openaiApiKey,
                model: settings.summaryModel || settings.openaiModel?.split(',')?.[0]?.trim() || settings.openaiModel
            },
            [],
            signal,
            noop
        );
        return response.text;
    }

    return '';
}

async function resolveSummary(sessionId, history, cutoff, settings, signal, onStatus) {
    const existing = await getSessionContextSummary(sessionId);
    if (existing?.text && existing.sourceMessageCount === cutoff) {
        return existing.text;
    }

    const canIncrement = existing?.text
        && Number.isInteger(existing.sourceMessageCount)
        && existing.sourceMessageCount > 0
        && existing.sourceMessageCount < cutoff;

    const previousSummary = canIncrement ? existing.text : '';
    const startIndex = canIncrement ? existing.sourceMessageCount : 0;
    const messagesToSummarize = history.slice(startIndex, cutoff);
    if (messagesToSummarize.length === 0) return previousSummary;

    const summaryPrompt = buildSummaryPrompt(previousSummary, messagesToSummarize);
    onStatus?.('compressing', {
        recentTurns: normalizeRecentTurns(settings.contextRecentTurns)
    });

    const text = (await generateSummary(summaryPrompt, settings, signal) || '').trim();
    if (!text) {
        onStatus?.('compression_failed', {
            recentTurns: normalizeRecentTurns(settings.contextRecentTurns)
        });
        return previousSummary;
    }

    if (sessionId) {
        await updateSessionContextSummary(sessionId, {
            text,
            sourceMessageCount: cutoff,
            updatedAt: Date.now()
        });
    }

    onStatus?.('compressed', {
        recentTurns: normalizeRecentTurns(settings.contextRecentTurns)
    });

    return text;
}

export async function prepareManagedContext(request, settings, history, signal, onStatus = null) {
    const sourceHistory = Array.isArray(history) ? history : [];
    if (settings.provider === 'web' || sourceHistory.length === 0) {
        return {
            history: sourceHistory,
            systemInstruction: request.systemInstruction || ''
        };
    }

    const recentTurns = normalizeRecentTurns(settings.contextRecentTurns);
    const cutoff = getRecentCutoff(sourceHistory, recentTurns);

    if (cutoff <= 0) {
        return {
            history: sourceHistory,
            systemInstruction: request.systemInstruction || ''
        };
    }

    const recentHistory = sourceHistory.slice(cutoff);
    const mode = normalizeContextMode(settings.contextMode);

    if (mode === 'recent') {
        return {
            history: recentHistory,
            systemInstruction: request.systemInstruction || ''
        };
    }

    try {
        const summary = await resolveSummary(request.sessionId, sourceHistory, cutoff, {
            ...settings,
            summaryModel: request.model
        }, signal, onStatus);
        return {
            history: recentHistory,
            systemInstruction: appendSummaryToSystemInstruction(request.systemInstruction, summary)
        };
    } catch (error) {
        console.warn('[Gemini Nexus] Failed to summarize history, falling back to recent turns:', error);
        onStatus?.('compression_failed', {
            recentTurns
        });
        return {
            history: recentHistory,
            systemInstruction: request.systemInstruction || ''
        };
    }
}
