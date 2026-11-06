(function () {
    'use strict';
    const figure = document.querySelector('[data-about-slideshow]');
    if (!figure) return;
    const slides = Array.from(figure.querySelectorAll('.about-slide'));
    const trigger = figure.querySelector('.about-slides');
    const dialog = figure.querySelector('.about-lightbox');
    const enlarged = dialog.querySelector('.about-lightbox-image');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0, timer = null, changeId = 0;
    let visible = !('IntersectionObserver' in window);
    let interacting = false;

    function canRotate() { return visible && !dialog.open && !interacting && !motion.matches && !document.hidden; }
    function stop() { clearTimeout(timer); timer = null; }
    function syncViewer() {
        enlarged.src = slides[index].src;
        enlarged.alt = slides[index].alt;
        dialog.setAttribute('aria-label', 'Profile photo ' + (index + 1) + ' of ' + slides.length);
    }
    async function show(next, automatic = false) {
        const id = ++changeId;
        try { await slides[next].decode(); } catch (_) { return false; }
        if (id !== changeId || (automatic && !canRotate())) return false;
        slides.forEach((slide, i) => {
            slide.classList.toggle('is-active', i === next);
            slide.setAttribute('aria-hidden', String(i !== next));
        });
        index = next;
        trigger.href = slides[index].src;
        if (dialog.open) syncViewer();
        return true;
    }
    function schedule() {
        stop();
        if (!canRotate()) return;
        timer = setTimeout(async () => {
            for (let offset = 1; offset < slides.length; offset++) {
                if (!canRotate() || await show((index + offset) % slides.length, true)) break;
            }
            schedule();
        }, 5000);
    }
    trigger.addEventListener('click', event => {
        event.preventDefault();
        stop(); ++changeId;
        syncViewer();
        dialog.showModal();
        document.body.classList.add('modal-open');
    });
    dialog.querySelector('.about-lightbox-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
        ++changeId;
        document.body.classList.remove('modal-open');
        trigger.focus({ preventScroll: true });
        schedule();
    });
    function navigate(direction) { show((index + direction + slides.length) % slides.length); }
    dialog.querySelector('.about-lightbox-prev').addEventListener('click', () => navigate(-1));
    dialog.querySelector('.about-lightbox-next').addEventListener('click', () => navigate(1));
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Tab') {
            const buttons = Array.from(dialog.querySelectorAll('button'));
            const current = buttons.indexOf(document.activeElement);
            const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
                : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
            event.preventDefault(); buttons[next].focus();
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault(); navigate(event.key === 'ArrowLeft' ? -1 : 1);
        }
    });
    // Pause while choosing a photo, and respect reduced-motion preferences.
    trigger.addEventListener('pointerenter', () => { interacting = true; schedule(); });
    trigger.addEventListener('pointerleave', () => { interacting = false; schedule(); });
    motion.addEventListener('change', schedule);
    document.addEventListener('visibilitychange', schedule);
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            visible = entries[0].isIntersecting;
            schedule();
        }, { threshold: .1 }).observe(trigger);
    }
    schedule();
}());
