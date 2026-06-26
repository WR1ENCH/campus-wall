// ===== spa.js - SPA 无刷新路由 =====

class SpaRouter {
  constructor(options = {}) {
    this.container = document.querySelector(options.container || '#main-content');
    this.transitionDuration = options.transitionDuration || 300;
    this.cacheTTL = options.cacheTTL || 60000;
    this.cache = new Map();
    this.scrollPositions = new Map();
    this.isTransitioning = false;

    this.init();
  }

  init() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-spa]');
      if (!link) return;
      if (link.getAttribute('target') === '_blank') return;
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        this.navigate(href);
      }
    });

    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.page) {
        this.loadPage(e.state.page, false);
      }
    });

    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a[data-spa]');
      if (link && !link.getAttribute('target')) {
        const href = link.getAttribute('href');
        if (href && !this.cache.has(href)) {
          this.prefetch(href);
        }
      }
    }, { passive: true });

    window.addEventListener('scroll', () => {
      this.scrollPositions[window.location.pathname] = window.scrollY;
    }, { passive: true });
  }

  prefetch(url) {
    if (this.cache.has(url)) return;
    fetch(url, { headers: { 'X-SPA-Request': '1' } })
      .then(r => r.text())
      .then(html => {
        this.cache.set(url, { html, time: Date.now() });
      })
      .catch(() => {});
  }

  navigate(url) {
    if (this.isTransitioning) return;
    history.pushState({ page: url }, '', url);
    this.loadPage(url, true);
  }

  loadPage(url, pushState) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const doTransition = (html) => {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const content = bodyMatch ? bodyMatch[1] : html;

      const oldContent = this.container;
      oldContent.classList.add('page-exit');

      setTimeout(() => {
        this.container.innerHTML = content;
        this.container.classList.remove('page-exit');
        this.container.classList.add('page-enter');

        setTimeout(() => {
          this.container.classList.remove('page-enter');
          this.isTransitioning = false;
        }, this.transitionDuration);

        const savedPos = this.scrollPositions[url];
        window.scrollTo(0, savedPos || 0);
      }, this.transitionDuration);
    };

    const cached = this.cache.get(url);
    if (cached && (Date.now() - cached.time) < this.cacheTTL) {
      doTransition(cached.html);
      return;
    }

    fetch(url, { headers: { 'X-SPA-Request': '1' } })
      .then(r => r.text())
      .then(html => {
        this.cache.set(url, { html, time: Date.now() });
        doTransition(html);
      })
      .catch(() => {
        window.location.href = url;
      });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SpaRouter };
}
