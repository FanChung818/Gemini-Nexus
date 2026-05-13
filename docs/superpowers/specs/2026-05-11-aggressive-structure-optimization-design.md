# Aggressive Structure Optimization Design

## Goal

Make the repository root the real runnable Chrome extension project root, reduce duplicated project boundaries, and strengthen automated checks around structure, versions, and packaging.

## Architecture

The current runnable app under `gemini-nexus/` moves to the repository root. Project-level files already at the root stay at the root and are updated to reference root-level build paths. The runtime domains remain recognizable:

- `background/` for the MV3 service worker and browser-control managers.
- `background/managers/mcp/` for dependency-free MCP transport, tool-result, preamble, and multi-server routing helpers used by the remote MCP manager.
- `content/` for injected page UI and toolbar scripts.
- `sandbox/` for isolated rendering and app UI.
- `sandbox/render/` keeps message state management separate from copy-button, media, and sources rendering helpers.
- `sandbox/ui/settings/sections/` keeps the connection settings controller separate from pure connection utilities and MCP tools-list rendering helpers.
- `sidepanel/` for the extension side-panel bridge.
- `services/` for provider and upload/auth APIs.
- `shared/` for cross-domain utilities that were previously in `lib/`, grouped by capability with thin top-level compatibility wrappers.

## Build And Packaging

Vite continues to build `sidepanel/index.html` and `sandbox/index.html`. The package script still assembles a complete loadable extension under `artifacts/chrome-extension`, but it reads inputs from the repository root and copies `shared/` instead of `lib/`.

The source manifest remains usable for root-directory development, while the package script owns the release shape: it concatenates content scripts in the canonical order from `scripts/content-script-order.mjs` into one packaged `content/index.js` entry and writes a packaged manifest that points to that single entry.

The GitHub Actions workflow runs from the repository root. Cache paths, artifact paths, and zip paths are updated to match the root-level package layout.

## Tests

The test suite gains structure tests that fail if the nested project returns, if `lib/` is reintroduced as a runtime shared directory, or if version values drift between `package.json`, `package-lock.json`, `manifest.json`, and the current changelog entry.

Packaging tests are updated to expect `shared/` runtime files and single-entry packaged content scripts. Manifest tests continue to guard source content-script coverage and canonical load order.

## Migration Boundary

This change does not convert the whole codebase to TypeScript and does not replace the content-script loader in one step. Those are follow-up refactors after the root migration is stable.
