import { t } from '../core/i18n.js';
import { TemplateIcons } from './templates/icons.js';

export class TabSelectorController {
    constructor() {
        this.modal = null;
        this.listEl = null;
        this.btnClose = null;
        this.triggerBtn = null;
        this.controlBar = null;
        this.controlTarget = null;
        this.controlStop = null;
        this.controlTitle = null;
        this.controlMeta = null;
        this.controlStatus = null;
        this.controlFavicon = null;
        this.controlFallbackIcon = null;
        this.onSelect = null;
        this.onChoose = null;
        this.onStop = null;
        this.currentLockedId = null;
        this.controlVisible = false;
        this.controlState = { tab: null, attached: false };

        this.queryElements();
        this.bindEvents();
    }

    queryElements() {
        this.modal = document.getElementById('tab-selector-modal');
        this.listEl = document.getElementById('tab-list');
        this.btnClose = document.getElementById('close-tab-selector');
        this.triggerBtn = document.getElementById('tab-switcher-btn');
        this.controlBar = document.getElementById('browser-control-bar');
        this.controlTarget = document.getElementById('browser-control-target');
        this.controlStop = document.getElementById('browser-control-stop');
        this.controlTitle = document.getElementById('browser-control-title');
        this.controlMeta = document.getElementById('browser-control-meta');
        this.controlStatus = document.getElementById('browser-control-status');
        this.controlFavicon = document.getElementById('browser-control-favicon');
        this.controlFallbackIcon = document.getElementById('browser-control-fallback-icon');
    }

    bindEvents() {
        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => this.close());
        }
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.close();
            });
        }
        if (this.controlTarget) {
            this.controlTarget.addEventListener('click', () => {
                if (this.onChoose) {
                    this.onChoose();
                    return;
                }
                this.triggerBtn?.click();
            });
        }
        if (this.controlStop) {
            this.controlStop.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onStop) this.onStop();
            });
        }
    }

    setControlCallbacks({ onChoose, onStop } = {}) {
        this.onChoose = typeof onChoose === 'function' ? onChoose : null;
        this.onStop = typeof onStop === 'function' ? onStop : null;
    }

    setControlVisible(visible) {
        this.controlVisible = visible === true;
        document.body.classList.toggle('browser-control-active', this.controlVisible);
        if (this.controlBar) {
            this.controlBar.hidden = !this.controlVisible;
        }
    }

    updateControlState({ tab = null, attached = false } = {}) {
        this.controlState = { tab, attached: attached === true };
        this.currentLockedId = tab?.id || null;
        this.renderControlState();
        this.updateTrigger(tab);
    }

    renderControlState() {
        const tab = this.controlState.tab;
        const attached = this.controlState.attached;
        const controllable = tab?.controllable !== false;

        if (this.controlTitle) {
            this.controlTitle.textContent = tab?.title || t('browserControlNoTab');
        }

        if (this.controlMeta) {
            this.controlMeta.textContent = tab ? this.formatTabMeta(tab) : '';
        }

        if (this.controlStatus) {
            if (!tab) {
                this.controlStatus.textContent = t('browserControlReady');
            } else if (!controllable) {
                this.controlStatus.textContent = t('browserControlUnavailable');
            } else {
                this.controlStatus.textContent = attached
                    ? t('browserControlDebugging')
                    : t('browserControlReady');
            }
        }

        if (this.controlBar) {
            this.controlBar.classList.toggle('is-attached', attached && controllable);
            this.controlBar.classList.toggle('is-unavailable', tab && !controllable);
            this.controlBar.classList.toggle('is-empty', !tab);
        }

        this.setFavicon(this.controlFavicon, tab?.favIconUrl, this.controlFallbackIcon);
    }

    open(tabs, onSelectCallback, lockedTabId) {
        this.onSelect = onSelectCallback;
        this.currentLockedId = lockedTabId;
        this.renderList(tabs);
        if (this.modal) this.modal.classList.add('visible');
    }

    close() {
        if (this.modal) this.modal.classList.remove('visible');
    }

    renderList(tabs) {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';

        if (!tabs || tabs.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.style.padding = '16px';
            emptyEl.style.textAlign = 'center';
            emptyEl.style.color = 'var(--text-tertiary)';
            emptyEl.style.fontSize = '13px';
            emptyEl.textContent = t('noTabsFound');
            this.listEl.appendChild(emptyEl);
            return;
        }

        tabs.forEach((tab) => {
            // Is this tab the "Locked" one?
            const isLocked = tab.id === this.currentLockedId;
            const isControllable = tab.controllable !== false;

            const item = document.createElement('div');
            // 'active' in CSS usually denotes selection, here we use it for locked state visibility
            item.className = `history-item browser-tab-item ${isLocked ? 'active' : ''} ${!isControllable ? 'disabled' : ''}`;
            item.dataset.tabId = String(tab.id);
            item.setAttribute('role', 'button');
            item.setAttribute('aria-disabled', String(!isControllable));
            if (isControllable) item.tabIndex = 0;

            // Tab Icon/Favicon
            const icon = document.createElement('img');
            icon.src = tab.favIconUrl || '';
            icon.style.width = '16px';
            icon.style.height = '16px';
            icon.style.marginRight = '8px';
            icon.style.borderRadius = '2px';
            icon.onerror = () => {
                icon.style.display = 'none';
            };

            const titleSpan = document.createElement('span');
            titleSpan.className = 'history-title';
            titleSpan.textContent = tab.title || tab.url;

            const metaSpan = document.createElement('span');
            metaSpan.className = 'browser-tab-meta';
            metaSpan.textContent = isControllable
                ? this.formatTabMeta(tab)
                : t('browserControlUnavailableReason');

            const copyWrap = document.createElement('span');
            copyWrap.className = 'browser-tab-copy';
            copyWrap.appendChild(titleSpan);
            copyWrap.appendChild(metaSpan);

            // Lock Button (Toggle State)
            const lockBtn = document.createElement('button');
            lockBtn.type = 'button';
            lockBtn.className = 'tab-lock-only-btn';
            lockBtn.disabled = !isControllable;

            // Icons
            const CLOSED_LOCK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
            const OPEN_LOCK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;

            if (isLocked) {
                lockBtn.innerHTML = CLOSED_LOCK;
                lockBtn.title = t('currentTab');
                lockBtn.style.color = 'var(--primary)';
            } else {
                lockBtn.innerHTML = OPEN_LOCK;
                lockBtn.title = t('controlTabInBackground');
                lockBtn.style.color = 'var(--text-tertiary)';
            }

            lockBtn.onclick = (e) => {
                e.stopPropagation();
                if (!isControllable) return;

                this.updateTrigger(tab);

                if (this.onSelect) this.onSelect(tab.id, false);
                this.close();
            };

            item.onclick = (e) => {
                if (!isControllable) return;

                if (!isLocked) {
                    this.updateTrigger(tab);
                }

                if (this.onSelect) this.onSelect(tab.id, true);
                this.close();
            };
            item.onkeydown = (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                item.click();
            };

            item.appendChild(icon);
            item.appendChild(copyWrap);
            item.appendChild(lockBtn);

            this.listEl.appendChild(item);
        });
    }

    updateTrigger(tab) {
        if (!this.triggerBtn) return;

        // Remove existing content
        this.triggerBtn.innerHTML = '';

        if (tab && tab.favIconUrl) {
            const img = document.createElement('img');
            img.src = tab.favIconUrl;
            img.style.width = '20px';
            img.style.height = '20px';
            img.style.borderRadius = '2px';
            img.style.objectFit = 'contain';

            // Fallback to default icon if image fails to load
            img.onerror = () => {
                this.resetTrigger();
            };

            this.triggerBtn.appendChild(img);
            this.triggerBtn.title = `Locked: ${tab.title}`;
            // Optional: Add a small lock indicator overlay on the trigger button
            this.triggerBtn.style.border = '1px solid var(--primary)';
        } else {
            this.resetTrigger();
        }
    }

    resetTrigger() {
        if (!this.triggerBtn) return;
        this.triggerBtn.innerHTML = TemplateIcons.TAB_STACK;
        this.triggerBtn.title = t('selectTabTooltip') || 'Select a tab to control';
        this.triggerBtn.style.border = 'none';
    }

    setFavicon(img, src, fallback) {
        if (!img) return;

        if (!src) {
            img.hidden = true;
            img.removeAttribute('src');
            if (fallback) fallback.hidden = false;
            return;
        }

        img.hidden = false;
        img.src = src;
        if (fallback) fallback.hidden = true;
        img.onerror = () => {
            img.hidden = true;
            img.removeAttribute('src');
            if (fallback) fallback.hidden = false;
        };
    }

    formatTabMeta(tab) {
        const url = tab?.url || '';
        try {
            const parsed = new URL(url);
            return parsed.hostname || url;
        } catch {
            return url;
        }
    }
}
