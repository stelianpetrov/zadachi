/* Падащо меню в долната лента на 3D моделите за смяна между стаите. */
(function () {
  var me = document.currentScript;
  var base = new URL('./', me ? me.src : location.href); // .../interior/
  var V = '?v=rs1';
  var ROOMS = [
    ['apartament/model.html', 'Целият апартамент', 'apartament/'],
    ['koridor/v3/model.html', 'Коридор', 'koridor/'],
    ['hol-kuhnya/v4/model.html', 'Хол + кухня', 'hol-kuhnya/'],
    ['spalnya/model.html', 'Спалня', 'spalnya/'],
    ['detska/model.html', 'Детска', 'detska/'],
    ['banya/model.html', 'Баня', 'banya/']
  ];

  function init() {
    var bar = document.querySelector('.bar') || document.getElementById('bar');
    if (!bar || document.getElementById('roomSwitch')) return;
    var here = location.pathname;
    var sel = document.createElement('select');
    sel.id = 'roomSwitch';
    sel.setAttribute('aria-label', 'Смени стаята');
    var matched = false;
    ROOMS.forEach(function (r) {
      var o = document.createElement('option');
      var url = new URL(r[0], base);
      o.value = url.pathname + V;
      o.textContent = r[1];
      if (!matched && here.indexOf(new URL(r[2], base).pathname) === 0) { o.selected = true; matched = true; }
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { location.href = sel.value; });

    var css = document.createElement('style');
    if (bar.classList.contains('bar')) {
      css.textContent =
        '.rs-group{align-items:center;padding:4px 6px 4px 12px}' +
        '.rs-group label{font-size:13px;color:var(--muted,#888);margin-right:2px}' +
        '#roomSwitch{font:inherit;font-size:14px;font-weight:500;color:var(--on-ink,#2a2420);background:var(--on,#e6dccb);' +
        'border:0;border-radius:9px;padding:0 30px 0 12px;min-height:40px;cursor:pointer;-webkit-appearance:none;appearance:none;' +
        'background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);' +
        'background-position:calc(100% - 16px) 50%,calc(100% - 11px) 50%;background-size:5px 5px;background-repeat:no-repeat}' +
        '#roomSwitch option{color:#2a2420;background:#fff}' +
        '#roomSwitch:focus-visible{outline:2px solid #d9a760;outline-offset:2px}' +
        '@media (max-width:700px){.rs-group label{display:none}#roomSwitch{font-size:13px}}';
      var g = document.createElement('div');
      g.className = 'group rs-group';
      g.setAttribute('role', 'group');
      var lab = document.createElement('label');
      lab.htmlFor = 'roomSwitch';
      lab.textContent = 'Стая';
      g.appendChild(lab);
      g.appendChild(sel);
      bar.insertBefore(g, bar.firstChild);
    } else {
      css.textContent =
        '#roomSwitch{font:500 13px "IBM Plex Sans",system-ui,sans-serif;padding:8px 30px 8px 12px;border:1px solid #22211e;' +
        'background-color:#22211e;color:#fffdf6;border-radius:8px;cursor:pointer;min-height:36px;-webkit-appearance:none;appearance:none;' +
        'background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);' +
        'background-position:calc(100% - 16px) 50%,calc(100% - 11px) 50%;background-size:5px 5px;background-repeat:no-repeat}' +
        '#roomSwitch option{color:#22211e;background:#fff}' +
        '@media (max-width:700px){#roomSwitch{font-size:12.5px}}';
      var sep = document.createElement('span');
      sep.className = 'sep';
      bar.insertBefore(sep, bar.firstChild);
      bar.insertBefore(sel, sep);
    }
    // На телефон линкът „← Целият апартамент“ застъпва лентата; менюто вече го съдържа.
    css.textContent += '@media (max-width:700px){.__all{display:none!important}}';
    document.head.appendChild(css);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
