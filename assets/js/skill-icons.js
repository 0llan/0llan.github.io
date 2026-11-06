(function () {
    'use strict';
    document.querySelectorAll('.skill-logo img').forEach(img => {
        const ready = () => img.parentElement.classList.toggle('is-loaded', img.naturalWidth > 0);
        img.addEventListener('load', ready);
        img.addEventListener('error', () => { img.parentElement.classList.remove('is-loaded'); img.hidden = true; });
        if (img.complete) ready();
    });
}());
