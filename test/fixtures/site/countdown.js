// Renders a countdown into #timer. Mode comes from data-mode on #timer.
(function () {
  var el = document.getElementById('timer');
  var mode = el.getAttribute('data-mode');
  var deadline;
  if (mode === 'fake') {
    deadline = Date.now() + 15 * 60 * 1000;
  } else if (mode === 'session') {
    var stored = Number(localStorage.getItem('deadline'));
    if (!stored) { stored = Date.now() + 15 * 60 * 1000; localStorage.setItem('deadline', String(stored)); }
    deadline = stored;
  } else if (mode === 'hold') {
    // A real reservation: one hold per browser session, kept across reloads.
    var held = Number(sessionStorage.getItem('hold'));
    if (!held) { held = Date.now() + 10 * 60 * 1000; sessionStorage.setItem('hold', String(held)); }
    deadline = held;
  } else {
    deadline = Number(el.getAttribute('data-deadline'));
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function render() {
    var s = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    el.textContent = pad(h) + ':' + pad(m) + ':' + pad(sec);
  }
  render();
  setInterval(render, 200);
})();
