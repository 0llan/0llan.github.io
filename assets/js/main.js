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
                item.hidden = item.classList.contains('Tour') || !showAll && !categories.some(function (category) {
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

}());
