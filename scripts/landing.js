'use strict';
(function () {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('site-nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('nav-menu-open', open);
  });

  links.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', () => {
      links.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-menu-open');
    });
  });
})();
