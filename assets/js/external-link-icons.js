(function () {
    'use strict';
    document.querySelectorAll('a[href]').forEach(link => {
        let url;
        try { url = new URL(link.href); } catch (_) { return; }
        if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
        // Only the destination hostname is sent, never profile IDs, paper IDs,
        // query strings, or the current page URL. No third-party scripts are used.
        const icon = document.createElement('span');
        icon.className = 'external-link-icon';
        icon.setAttribute('aria-hidden', 'true');
        const fallback = document.createElement('span');
        fallback.className = 'external-link-fallback';
        fallback.textContent = '↗';
        const img = document.createElement('img');
        img.alt = '';
        img.width = img.height = 18;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('load', () => icon.classList.add('is-loaded'));
        img.addEventListener('error', () => { img.remove(); icon.classList.remove('is-loaded'); }, { once: true });
        img.src = url.hostname === 'scholar.gist.ac.kr'
            ? 'https://www.gist.ac.kr/kr/img/sub01/01030301_img01.png'
            : 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(url.hostname) + '&sz=32';
        icon.append(fallback, img);
        link.prepend(icon);
        link.classList.add('has-external-icon');
    });
}());
