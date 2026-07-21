(function () {
    'use strict';

    var overview = document.querySelector('[data-view-panel="overview"]');
    var gallery = document.querySelector('[data-view-panel="gallery"]');
    var galleryToggles = document.querySelectorAll('[data-view="gallery"]');
    var overviewToggles = document.querySelectorAll('[data-view="overview"]');
    var overviewLinks = document.querySelectorAll('.overview-link');

    function setView(view, updateHash) {
        var showGallery = view === 'gallery';
        overview.hidden = showGallery;
        gallery.hidden = !showGallery;
        document.body.classList.toggle('gallery-active', showGallery);

        galleryToggles.forEach(function (button) {
            button.setAttribute('aria-selected', String(showGallery));
            button.classList.toggle('active', showGallery);
        });

        if (updateHash) {
            history.pushState(null, '', showGallery ? '#gallery' : '#top');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    galleryToggles.forEach(function (button) {
        button.addEventListener('click', function () { setView('gallery', true); });
    });

    overviewToggles.forEach(function (button) {
        button.addEventListener('click', function () { setView('overview', true); });
    });

    overviewLinks.forEach(function (link) {
        link.addEventListener('click', function (event) {
            if (!gallery.hidden) {
                event.preventDefault();
                var selector = link.getAttribute('href');
                setView('overview', false);
                requestAnimationFrame(function () {
                    var target = document.querySelector(selector);
                    if (target) target.scrollIntoView({ behavior: 'smooth' });
                    history.pushState(null, '', selector);
                });
            }
        });
    });

    window.addEventListener('hashchange', function () {
        if (window.location.hash === '#gallery') setView('gallery', false);
        else if (!gallery.hidden) setView('overview', false);
    });

    if (window.location.hash === '#gallery') setView('gallery', false);

    var filters = document.querySelectorAll('#filters .filter');
    var galleryItems = document.querySelectorAll('#portfoliolist > .portfolio');

    filters.forEach(function (filter) {
        filter.setAttribute('role', 'button');
        filter.setAttribute('tabindex', '0');
        function applyFilter() {
            var categories = filter.getAttribute('data-filter').split(/\s+/);
            var showAll = categories.length > 1;
            filters.forEach(function (item) { item.classList.remove('active'); });
            filter.classList.add('active');
            galleryItems.forEach(function (item) {
                item.hidden = !showAll && !categories.some(function (category) {
                    return item.classList.contains(category);
                });
            });
        }
        filter.addEventListener('click', applyFilter);
        filter.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                applyFilter();
            }
        });
    });

    var activeModal = null;
    var modalTrigger = null;
    var modals = document.querySelectorAll('.gallery-shell .modal');

    function carouselItems(carousel) {
        return Array.prototype.slice.call(carousel.querySelectorAll('.carousel-inner > .item'));
    }

    function showSlide(carousel, nextIndex) {
        var items = carouselItems(carousel);
        if (!items.length) return;
        var index = (nextIndex + items.length) % items.length;
        items.forEach(function (item, itemIndex) {
            item.classList.toggle('active', itemIndex === index);
        });
        carousel.querySelectorAll('.carousel-indicators > li').forEach(function (indicator, indicatorIndex) {
            indicator.classList.toggle('active', indicatorIndex === index);
        });
    }

    function closeModal() {
        if (!activeModal) return;
        activeModal.classList.remove('is-open');
        activeModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        if (modalTrigger) modalTrigger.focus();
        activeModal = null;
        modalTrigger = null;
    }

    function openModal(modal, trigger) {
        if (!modal) return;
        activeModal = modal;
        modalTrigger = trigger;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        modal.setAttribute('aria-modal', 'true');
        document.body.classList.add('modal-open');
        var carousel = modal.querySelector('.carousel');
        if (carousel) showSlide(carousel, 0);
        var closeButton = modal.querySelector('.gallery-modal-close');
        if (closeButton) closeButton.focus();
    }

    modals.forEach(function (modal) {
        modal.setAttribute('aria-hidden', 'true');
        var content = modal.querySelector('.modal-content');
        if (content && !content.querySelector('.gallery-modal-close')) {
            var closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'gallery-modal-close';
            closeButton.setAttribute('aria-label', 'Close gallery viewer');
            closeButton.textContent = '×';
            closeButton.addEventListener('click', closeModal);
            content.insertBefore(closeButton, content.firstChild);
        }
        modal.addEventListener('click', function (event) {
            if (event.target === modal) closeModal();
        });
    });

    document.querySelectorAll('.gallery-shell [data-toggle="modal"]').forEach(function (trigger) {
        trigger.addEventListener('click', function (event) {
            event.preventDefault();
            openModal(document.querySelector(trigger.getAttribute('data-target')), trigger);
        });
    });

    document.querySelectorAll('.gallery-shell .carousel-control').forEach(function (control) {
        control.addEventListener('click', function (event) {
            event.preventDefault();
            var carousel = control.closest('.carousel');
            var items = carouselItems(carousel);
            var currentIndex = items.findIndex(function (item) { return item.classList.contains('active'); });
            showSlide(carousel, currentIndex + (control.getAttribute('data-slide') === 'prev' ? -1 : 1));
        });
    });

    document.querySelectorAll('.gallery-shell .carousel-indicators > li').forEach(function (indicator) {
        indicator.addEventListener('click', function () {
            var carousel = indicator.closest('.carousel');
            showSlide(carousel, Number(indicator.getAttribute('data-slide-to')) || 0);
        });
    });

    document.addEventListener('keydown', function (event) {
        if (!activeModal) return;
        if (event.key === 'Escape') closeModal();
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            var carousel = activeModal.querySelector('.carousel');
            var items = carouselItems(carousel);
            var currentIndex = items.findIndex(function (item) { return item.classList.contains('active'); });
            showSlide(carousel, currentIndex + (event.key === 'ArrowLeft' ? -1 : 1));
        }
    });

    var year = document.getElementById('current-year');
    if (year) year.textContent = String(new Date().getFullYear());

    var joystick = document.getElementById('joystick');
    if (!joystick) return;

    var layers = {};
    joystick.querySelectorAll('[data-direction]').forEach(function (layer) {
        layers[layer.getAttribute('data-direction')] = layer;
        layer.style.opacity = layer.getAttribute('data-direction') === 'front' ? '1' : '0';
    });

    var directions = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
    var target = { x: 0, y: 0 };
    var current = { x: 0, y: 0 };
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function clampVector(x, y) {
        var length = Math.hypot(x, y);
        if (length > 1) return { x: x / length, y: y / length };
        return { x: x, y: y };
    }

    function pointJoystick(clientX, clientY) {
        var rect = joystick.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;
        var range = Math.max(240, Math.min(window.innerWidth, window.innerHeight) * 0.42);
        target = clampVector((clientX - centerX) / range, (clientY - centerY) / range);
    }

    window.addEventListener('pointermove', function (event) {
        if (event.pointerType !== 'touch') pointJoystick(event.clientX, event.clientY);
    }, { passive: true });

    joystick.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'touch') pointJoystick(event.clientX, event.clientY);
    }, { passive: true });

    joystick.addEventListener('keydown', function (event) {
        var step = 0.24;
        if (event.key === 'ArrowLeft') target.x -= step;
        else if (event.key === 'ArrowRight') target.x += step;
        else if (event.key === 'ArrowUp') target.y -= step;
        else if (event.key === 'ArrowDown') target.y += step;
        else if (event.key === 'Home' || event.key === 'Escape') target = { x: 0, y: 0 };
        else return;
        event.preventDefault();
        target = clampVector(target.x, target.y);
    });

    function renderJoystick() {
        var easing = reducedMotion ? 1 : 0.11;
        current.x += (target.x - current.x) * easing;
        current.y += (target.y - current.y) * easing;

        var magnitude = Math.min(1, Math.hypot(current.x, current.y));
        var angle = Math.atan2(current.y, current.x) * 180 / Math.PI;
        if (angle < 0) angle += 360;
        var sector = angle / 45;
        var firstIndex = Math.floor(sector) % 8;
        var secondIndex = (firstIndex + 1) % 8;
        var blend = sector - Math.floor(sector);

        directions.forEach(function (name) { layers[name].style.opacity = '0'; });
        layers.front.style.opacity = String(1 - magnitude * 0.94);
        layers[directions[firstIndex]].style.opacity = String(magnitude * (1 - blend));
        layers[directions[secondIndex]].style.opacity = String(magnitude * blend);

        joystick.style.setProperty('--joystick-x', (current.x * 5).toFixed(2) + 'px');
        joystick.style.setProperty('--joystick-y', (current.y * 5).toFixed(2) + 'px');
        joystick.style.setProperty('--joystick-rotate-x', (-current.y * 3).toFixed(2) + 'deg');
        joystick.style.setProperty('--joystick-rotate-y', (current.x * 3).toFixed(2) + 'deg');

        requestAnimationFrame(renderJoystick);
    }

    requestAnimationFrame(renderJoystick);
}());
