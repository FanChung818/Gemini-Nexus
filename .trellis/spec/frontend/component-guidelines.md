# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

(To be filled by the team)

---

## Component Structure

This project uses native DOM rendering modules rather than a component framework for the sandbox chat UI.

### Convention: Render Controllers for Streamed Message UI

**What**: DOM render helpers that create streamed UI must return a small controller object for later updates.

**Why**: Streaming messages receive text, thoughts, sources, and images at different times. Keeping update behavior inside the render module prevents controller code from duplicating DOM queries or knowing markup details.

**Example**:

```javascript
const bubble = appendMessage(historyDiv, "", "ai", null, "", null, {
    isStreaming: true
});

bubble.update(nextText, nextThoughts, { isStreaming: true });
bubble.finalize(finalText, finalThoughts);
bubble.addSources(sources);
bubble.addImages(images);
```

**Contract**:
- `update(text, thoughts, { isStreaming: true })` updates the existing message nodes and must not create duplicate streamed sections.
- `finalize(text, thoughts)` applies final streamed state such as completed labels, elapsed duration, and auto-collapse behavior.
- Restored history messages call `appendMessage()` without streaming options and must not briefly enter streaming UI states.

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Styling Patterns

Use shared CSS files and existing CSS variables. Do not add frontend runtime styling libraries for isolated sandbox UI changes.

### Pattern: Lightweight Thinking / Reasoning Blocks

**Problem**: Reasoning content is streamed separately from the final answer and should be inspectable without dominating the message.

**Solution**: Render thoughts as a lightweight collapsible block above the AI response:
- Use a native `<button>` trigger with `aria-expanded` and `aria-controls`.
- Expand automatically while thoughts are streaming.
- Collapse automatically on final reply and show elapsed seconds when available.
- Hide the block for empty or whitespace-only thoughts.
- Style with low-contrast text and a left border instead of a card container.

**Why**: This matches the current AI chat UX pattern while keeping implementation native to the extension.

---

## Accessibility

- Interactive disclosure controls must be buttons, not clickable `<div>` elements.
- Disclosure triggers must keep `aria-expanded` and `aria-controls` in sync with the content region.
- Hidden disclosure content should use the `hidden` attribute so keyboard and screen-reader behavior matches visual state.

---

## Common Mistakes

- Treating whitespace-only streamed fields as displayable content. Trim before deciding whether optional regions should be visible.
- Starting elapsed time when an empty streaming bubble is created. For optional streamed sections, start timing when the first displayable content for that section arrives.
- Letting restored history messages reuse live streaming options. History render paths should default to stable, collapsed completed state.

## Scenario: Tool Call Message Rendering Contract

### 1. Scope / Trigger

- Trigger: Any change that renders browser-control or MCP tool calls, tool output, Gemini native function calls, or restored tool history.
- Tool call UI is a cross-layer contract: provider responses are parsed in the background, tool status/output is emitted over runtime messages, messages are persisted in session storage, and sandbox render helpers produce the visible disclosure UI.

### 2. Signatures

- Runtime status message: `{ action: "TOOL_CALL_STATUS_MESSAGE", sessionId, statusKey, toolName, status, toolCallText, callIndex?, callCount?, text? }`.
- Runtime output message: `{ action: "TOOL_OUTPUT_MESSAGE", sessionId, toolName, text, images?, toolCallText?, status, step?, callIndex?, callCount? }`.
- Stored tool output message metadata: `{ kind: "tool-output", toolName, toolStatus, toolCallText, toolStep, toolCallIndex?, toolCallCount? }`.
- Render options for `appendMessage(...)`: `{ kind: "tool-output" | "tool-status", toolName, toolStatus, toolCallText, step, callIndex?, callCount?, isCollapsed? }`.

### 3. Contracts

- A raw tool call must render inside the tool disclosure, not as a standalone assistant message.
- Tool output must render as a collapsed disclosure by default. It may show a short preview, but full args/output belong in the disclosure body.
- `step` represents the current tool loop round. It must not be incremented for multiple tool calls returned in the same model response.
- `callIndex` and `callCount` identify multiple tool calls in the same response. They must be persisted and restored so reopened sessions keep the same metadata.
- Tool status/output keys must include `callIndex` when `callCount > 1` to avoid same-name tool calls overwriting each other.
- Thinking-only assistant messages and adjacent tool disclosures should use explicit render classes for compact spacing. Do not depend on `:has()` selectors or negative margins for this relationship.

### 4. Validation & Error Matrix

- Empty or whitespace-only tool call text -> omit the raw call block, keep the output disclosure.
- Missing `callIndex` / `callCount` -> render as a single-call tool output and omit the call counter.
- Same tool name appears multiple times in one response -> status/output keys must remain distinct.
- Restored legacy messages without metadata -> recover `toolName` and `step` from the saved `[Tool Output: ...]` text when possible.

### 5. Good/Base/Bad Cases

- Good: A Gemini response with two `functionCall` parts creates two tool disclosures with the same `step` and `Call 1/2`, `Call 2/2` metadata.
- Base: A text-based tool command creates one status disclosure and one output disclosure without a call counter.
- Bad: Raw `{"tool": ...}` JSON appears as normal assistant markdown, tool output replaces the thinking block, or the same-name second tool call reuses the first status block.

### 6. Tests Required

- Assert native multi-call responses preserve one loop `step` while assigning sequential `callIndex` values.
- Assert runtime status/output keys differ for same-name multi-call tools.
- Assert restored tool-output messages pass `toolCallIndex` and `toolCallCount` back into `appendMessage`.
- Assert thinking-only and tool disclosures receive compact spacing classes without relying on CSS `:has()`.

### 7. Wrong vs Correct

#### Wrong

```javascript
const step = loopCount + index + 1;
meta.textContent = `Raw tool: ${toolName} · Next step ${step}`;
```

#### Correct

```javascript
const step = loopCount;
const callIndex = index + 1;
meta.textContent = `Raw tool: ${toolName} · Step ${step} · Call ${callIndex}/${callCount}`;
```
