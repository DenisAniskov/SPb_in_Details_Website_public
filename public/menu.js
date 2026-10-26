// Progressive enhancement for the mobile menu. The native <details> element
// already opens and closes it without JavaScript; this only closes the panel
// after a link is chosen, on an outside click, or with Escape.
//
// Served from /menu.js as a plain external file so the site can ship a strict
// Content-Security-Policy without inline scripts.
(function () {
  var toggle = document.querySelector('.nav-toggle');
  if (!toggle) {
    return;
  }

  toggle.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('a')) {
      toggle.open = false;
    }
  });

  document.addEventListener('click', function (event) {
    if (toggle.open && event.target && !toggle.contains(event.target)) {
      toggle.open = false;
    }
  });

  toggle.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      toggle.open = false;
      var summary = toggle.querySelector('summary');
      if (summary) {
        summary.focus();
      }
    }
  });
})();
