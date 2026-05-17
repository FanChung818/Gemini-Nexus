// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { AboutSection } from './about.js';

describe('AboutSection', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="about-settings-group">
                <button id="download-logs"></button>
                <span id="star-count"></span>
                <span id="app-current-version"></span>
                <span id="app-update-status"></span>
            </div>
        `;
    });

    it('renders update versions as text inside the release link', () => {
        const section = new AboutSection();

        section.displayUpdateStatus('<img src=x onerror="alert(1)">2.0.0', '1.0.0', true);

        const updateStatus = document.getElementById('app-update-status');
        const link = updateStatus.querySelector('a.app-update-link');
        expect(link).not.toBeNull();
        expect(link.textContent).toBe('Update available: <img src=x onerror="alert(1)">2.0.0');
        expect(updateStatus.querySelector('img')).toBeNull();
    });
});
