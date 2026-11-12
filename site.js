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
})();
