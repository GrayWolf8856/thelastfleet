// Small helpers for thelastfleet.com. No libraries.
(function () {
  // YouTube: a thumbnail link (a.yt[data-yt]) becomes the player when pressed.
  // Without JavaScript the link simply opens the video on YouTube.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.yt[data-yt]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(a.dataset.yt) + '?autoplay=1&rel=0';
    f.title = a.getAttribute('aria-label') || 'Video';
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.allowFullscreen = true;
    var box = document.createElement('div');
    box.className = a.className;
    box.appendChild(f);
    a.replaceWith(box);
  });

  // Gallery: pictures inside .gal (with or without captions) open large; arrows or the side buttons step through.
  var lb, set = [], at = 0;
  function show(i) {
    at = (i + set.length) % set.length;
    lb.querySelector('img').src = set[at].href;
    lb.querySelector('img').alt = set[at].querySelector('img').alt;
  }
  function close() { if (lb) { lb.remove(); lb = null; } }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.gal a');
    if (a) {
      e.preventDefault();
      set = Array.prototype.slice.call(a.closest('.gal').querySelectorAll('a'));
      lb = document.createElement('div');
      lb.className = 'lb';
      lb.innerHTML = '<img alt=""><button class="p" aria-label="Previous picture">‹</button><button class="n" aria-label="Next picture">›</button>';
      document.body.appendChild(lb);
      show(set.indexOf(a));
      return;
    }
    if (!lb || !lb.contains(e.target)) return;
    if (e.target.className === 'p') show(at - 1);
    else if (e.target.className === 'n') show(at + 1);
    else close();
  });
  document.addEventListener('keydown', function (e) {
    if (!lb) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
  });

  // Phone: bring the current game's tab into view in the scrolling tab strip.
  var on = document.querySelector('nav.links.tabs a.on');
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });

  // Visit counter: GoatCounter (no cookies, no personal data). Dashboard: https://thelastfleet.goatcounter.com
  var gc = document.createElement('script');
  gc.async = true;
  gc.src = 'https://gc.zgo.at/count.js';
  gc.dataset.goatcounter = 'https://thelastfleet.goatcounter.com/count';
  document.head.appendChild(gc);

  // Count presses on links that leave the site (beta sign-ups, stores, Discord) and on video plays.
  var named = [
    [/testflight\.apple\.com/, 'beta-iphone-testflight'],
    [/groups\.google\.com\/g\/holdout-android-testers/, 'beta-android-group'],
    [/play\.google\.com\/apps\/testing/, 'beta-android-play-optin'],
    [/^intent:|play\.google\.com\/store/, 'android-play-store'],
    [/play\.google\.com\/redeem/, 'android-play-redeem'],
    [/apps\.apple\.com/, 'iphone-app-store'],
    [/discord\.(gg|com)/, 'discord'],
    [/^mailto:/, 'email']
  ];
  function event(path, title) {
    if (window.goatcounter && window.goatcounter.count)
      window.goatcounter.count({ path: path, title: title, event: true });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (a.matches('a.yt[data-yt]')) return event('play-video/' + a.dataset.yt, a.getAttribute('aria-label') || 'Video');
    var href = a.getAttribute('href');
    for (var i = 0; i < named.length; i++)
      if (named[i][0].test(href)) return event('click/' + named[i][1], location.pathname);
    if (a.host && a.host !== location.host && /^https?:/.test(a.protocol)) event('out/' + a.host, location.pathname);
  }, true);
})();
