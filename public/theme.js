// Theme selection for the official site.
//
// Loaded as a plain external file from <head> *without* defer: the attribute has
// to be on <html> before the first paint, otherwise a visitor who chose light on
// a dark system would see the dark theme flash for a frame. The Content-Security
// -Policy allows 'self' scripts and no inline code, so this file is the only way
// to run before the first paint.
//
// Without JavaScript the site still follows the system preference — that part is
// pure CSS (`prefers-color-scheme`), and the switcher stays hidden because a
// control that cannot do anything is worse than no control.
(function () {
  var KEY = 'spb-theme';
  var MODES = ['system', 'light', 'dark'];
  var THEME_COLOR = { light: '#f6f4ef', dark: '#000a2e' };
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  var mode = 'system';
  try {
    var stored = window.localStorage.getItem(KEY);
    if (MODES.indexOf(stored) > -1) {
      mode = stored;
    }
  } catch (error) {
    // Storage can be blocked (private mode, third-party cookie rules). The
    // switcher keeps working for the current page; the choice is just not kept.
    mode = 'system';
  }

  function resolved() {
    if (mode !== 'system') {
      return mode;
    }
    return media && media.matches ? 'light' : 'dark';
  }

  // Paints the current mode. In system mode the attribute is removed instead of
  // set, so the CSS media query stays in charge and keeps reacting to the system
  // setting without another script run.
  function paint() {
    var value = resolved();
    if (mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }
    root.setAttribute('data-theme-mode', mode);

    var color = THEME_COLOR[value] || THEME_COLOR.dark;
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) {
      metas[i].setAttribute('content', color);
      metas[i].removeAttribute('media');
    }
  }

  function options() {
    return document.querySelectorAll('[data-theme-option]');
  }

  // Reflects the chosen mode in every switcher on the page (the header one and
  // the one inside the mobile menu) and reveals them: they ship hidden so that
  // no-JavaScript visitors never see a control that does nothing.
  function sync() {
    var groups = document.querySelectorAll('[data-theme-switch]');
    for (var g = 0; g < groups.length; g += 1) {
      groups[g].removeAttribute('hidden');
    }
    var all = options();
    for (var i = 0; i < all.length; i += 1) {
      var current = all[i].getAttribute('data-theme-option') === mode;
      all[i].setAttribute('aria-checked', current ? 'true' : 'false');
      all[i].setAttribute('tabindex', current ? '0' : '-1');
    }
  }

  function setMode(next) {
    if (MODES.indexOf(next) < 0 || next === mode) {
      return;
    }
    mode = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch (error) {
      // Not being able to remember the choice must not break the switcher.
    }
    paint();
    sync();
  }

  paint();

  // A system change while "system" is selected repaints the page live: the CSS
  // media query does the colours, this keeps the browser UI colour in step.
  if (media) {
    var onChange = function () {
      if (mode === 'system') {
        paint();
        sync();
      }
    };
    if (media.addEventListener) {
      media.addEventListener('change', onChange);
    } else if (media.addListener) {
      media.addListener(onChange);
    }
  }

  // Wires one switcher. Takes the group as an argument rather than reading a
  // loop variable: the handlers outlive the loop, and a captured `var` would
  // point at the last group on the page (or past the end of the list).
  function wire(group) {
    group.addEventListener('click', function (event) {
      var option =
        event.target && event.target.closest ? event.target.closest('[data-theme-option]') : null;
      if (option) {
        setMode(option.getAttribute('data-theme-option'));
      }
    });

    // Radio-group keyboard behaviour: arrows move the selection, and moving it
    // applies the theme straight away — the same as clicking the option.
    //
    // The index is computed inside the group that received the key event, not
    // across every switcher on the page: the page renders two of them (header
    // and mobile menu), and stepping out of the visible one would select an
    // option the visitor cannot see while focus stays behind.
    group.addEventListener('keydown', function (event) {
      var keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
      if (keys.indexOf(event.key) < 0) {
        return;
      }
      var choices = group.querySelectorAll('[data-theme-option]');
      if (choices.length === 0) {
        return;
      }
      var current = -1;
      for (var i = 0; i < choices.length; i += 1) {
        if (choices[i].getAttribute('data-theme-option') === mode) {
          current = i;
        }
      }
      var next;
      if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = choices.length - 1;
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        next = (current + 1 + choices.length) % choices.length;
      } else {
        next = (current - 1 + choices.length) % choices.length;
      }
      event.preventDefault();
      setMode(choices[next].getAttribute('data-theme-option'));
      choices[next].focus();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    sync();
    var groups = document.querySelectorAll('[data-theme-switch]');
    for (var g = 0; g < groups.length; g += 1) {
      wire(groups[g]);
    }
  });
})();
