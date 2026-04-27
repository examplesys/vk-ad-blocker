// ==UserScript==
// @name         VK AdBlocker
// @version      2026-04-16
// @author       Me
// @match        https://vk.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=vk.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    function removeAdsFromFeedItems(json) {
        if (!json.response || !json.response.items) return;

        const itemCount = json.response.items.length;
        if (json.response && json.response.items) {
            json.response.items = json.response.items.filter((item) => item.type != 'ads' && item.type != 'recommended_game' && !item.author_ad);
        }

        const adsCount = itemCount - json.response.items.length;
        console.log('[VK-Ad] Feed (Removed ' + adsCount + ' ads)');
    }

    function setupXHRHook() {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            const shouldBlock =
                  url.endsWith('undefined') ||
                  url.endsWith('usefull.php') ||
                  url.includes('ads_rotate.php') ||
                  url.includes('ad.mail.ru') ||
                  url.includes('stats.vk-portal.net') ||
                  url.includes('ads_light.php') ||
                  url.includes('account.getLeftAds') ||
                  url.includes('al_feed_right_block');

            if (shouldBlock) {
                console.log('[VK-Ad] Blocked: ' + url);

                this._aborted = true;

                Object.defineProperty(this, 'status', { value: 200, writable: false });
                Object.defineProperty(this, 'statusText', { value: 'OK', writable: false });
                return;
            }

            return originalOpen.apply(this, arguments);
        };

        const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function(a, b) {
            if (this._aborted) return;

            return originalSetRequestHeader.apply(this, arguments);
        };

        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function() {
            if (this._aborted) {
                setTimeout(() => this.dispatchEvent(new Event('load')), 0);
                return;
            }

            return originalSend.apply(this, arguments);
        };
    }

    function setupFetchHook() {
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const [resource, config] = args;
            const url = typeof resource === 'string' ? resource : resource.url;
            const shouldFail =
                  url.endsWith('undefined') ||
                  url.includes('ads_light.php') ||
                  url.includes('apps.getFeedRecommendedGameBlock') ||
                  url.includes('account.getLeftAds') ||
                  url.includes('sdk-api.apptracer.ru') ||
                  url.includes('stats.vk-portal.net');

            if (shouldFail) {
                console.log('[VK-Ad] Blocked: ' + url);
                return Promise.resolve(new Response('Bad Request', { status: 500 }));
            }

            const response = await originalFetch.apply(this, args);
            if (response.headers.get('content-type')?.includes('application/json')) {
                const originalJson = await response.clone().json();
                const modified = { ...originalJson };

                if (url.includes('newsfeed.getFeed')) {
                    removeAdsFromFeedItems(modified);
                }

                response.text = () => Promise.resolve(JSON.stringify(modified));
                response.json = () => Promise.resolve(modified);
            }

            return response;
        };
    }

    function setupPrefetchHook() {
        const originalCur = window.cur;
        const handler = {
            set(target, prop, value) {
                if (prop === 'apiPrefetchCache' && typeof value === 'object') {
                    console.log('apiPrefetchCache spoofed');
                    const filtered = [...value];
                    for (let i = 0; i < filtered.length; i++) {
                        removeAdsFromFeedItems(filtered[i]);
                    }
                    target[prop] = filtered;
                } else {
                    target[prop] = value;
                }
                return true;
            }
        };

        window.cur = new Proxy(originalCur || {disabledAnalytics: true}, handler);

        let curProxy = window.cur;
        Object.defineProperty(window, 'cur', {
            get() { return curProxy; },
            set(value) {
                curProxy = new Proxy(value || {}, handler);
                return true;
            },
            configurable: true
        });
    }

    setupXHRHook();
    setupFetchHook();
    setupPrefetchHook();
})();
