// Progressive enhancement for two controls that already work without JavaScript:
//
//   * the "copy SHA-256" button — without JavaScript the checksum stays a
//     selectable block of text, which is what the button falls back to anyway;
//   * the screenshot lightbox — each screenshot is a real link to the full-size
//     PNG, so without JavaScript it opens in a new tab instead of a dialog.
//
// Served as an external file to keep the Content-Security-Policy strict (no
// inline scripts, no 'unsafe-inline').
(function () {
  function each(list, callback) {
    Array.prototype.forEach.call(list, callback);
  }

  // --- Copy the checksum -----------------------------------------------------

  function setupCopyButtons() {
    each(document.querySelectorAll('[data-copy-source]'), function (button) {
      var source = document.querySelector(button.getAttribute('data-copy-source'));
      var status = button.parentNode ? button.parentNode.querySelector('[data-copy-status]') : null;
      if (!source || !status) {
        return;
      }

      var timer = null;
      function report(message, ok) {
        status.textContent = message;
        status.setAttribute('data-state', ok ? 'ok' : 'manual');
        if (timer) {
          window.clearTimeout(timer);
        }
        timer = window.setTimeout(function () {
          status.textContent = '';
          status.removeAttribute('data-state');
        }, 8000);
      }

      // Selects the checksum on the page: the reader can then press Ctrl+C even
      // where the clipboard API is missing or refused.
      function selectForManualCopy() {
        try {
          var range = document.createRange();
          range.selectNodeContents(source);
          var selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          report('Скопировать автоматически не удалось: сумма выделена, нажмите Ctrl+C', false);
        } catch (error) {
          report('Скопируйте сумму вручную: она выделена на странице', false);
        }
      }

      button.addEventListener('click', function () {
        var value = (source.textContent || '').trim();
        if (value === '') {
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(
            function () {
              report('Контрольная сумма скопирована в буфер обмена', true);
            },
            function () {
              selectForManualCopy();
            },
          );
        } else {
          selectForManualCopy();
        }
      });

      // The button is part of the markup but hidden, so a no-JavaScript visitor
      // never meets a control that cannot work.
      button.removeAttribute('hidden');
    });
  }

  // --- Enlarged screenshot ---------------------------------------------------

  function setupLightbox() {
    var dialog = document.querySelector('[data-lightbox]');
    if (!dialog || typeof dialog.showModal !== 'function') {
      return;
    }
    var image = dialog.querySelector('[data-lightbox-image]');
    var caption = dialog.querySelector('[data-lightbox-caption]');
    var close = dialog.querySelector('[data-lightbox-close]');
    var triggers = document.querySelectorAll('[data-lightbox-open]');
    if (!image || !close || triggers.length === 0) {
      return;
    }

    each(triggers, function (trigger) {
      trigger.addEventListener('click', function (event) {
        var source = trigger.querySelector('img');
        if (!source) {
          return;
        }
        event.preventDefault();
        image.setAttribute('src', trigger.getAttribute('href'));
        image.setAttribute('alt', source.getAttribute('alt') || '');
        if (caption) {
          caption.textContent = trigger.getAttribute('data-lightbox-title') || '';
        }
        dialog.showModal();
        close.focus();
      });
    });

    close.addEventListener('click', function () {
      dialog.close();
    });

    // A click on the backdrop is a click on the dialog element itself.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) {
        dialog.close();
      }
    });
  }

  function start() {
    setupCopyButtons();
    setupLightbox();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
