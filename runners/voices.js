// Fleet Voices: record or upload a take for each picked line, then send them all to the intake script.
// Settings live on the form in voices.html (data-endpoint, data-release). No libraries.
(function () {
  var form = document.querySelector('form.vform');
  if (!form) return;

  var MAX_LINES = 3;          // script lines; the own line is extra
  var MAX_SECONDS = 30;       // a recording stops by itself after this
  var MAX_BYTES = 10 * 1024 * 1024;
  var endpoint = form.dataset.endpoint;
  var msg = form.querySelector('.vmsg');
  var sendBtn = form.querySelector('button[type=submit]');
  var picks = form.querySelectorAll('input[name=line]');
  var EXT_TYPES = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav',
    ogg: 'audio/ogg', oga: 'audio/ogg', webm: 'audio/webm', opus: 'audio/ogg' };

  function say(text, bad) { msg.textContent = text; msg.className = 'vmsg' + (bad ? ' bad' : ''); }
  function close() { form.querySelector('.vclosed').hidden = false; sendBtn.disabled = true; }

  if (!endpoint) close();
  else fetch(endpoint).then(function (r) { return r.json(); })
    .then(function (s) { if (s && s.open === false) close(); })
    .catch(function () { /* if the check fails, still let people try to send */ });

  // ---- Picking lines ----
  function lineEl(box) { return box.closest('.vline'); }
  function countPicks() {
    var n = 0;
    picks.forEach(function (p) { if (p.checked && p.value !== 'OWN') n++; });
    form.querySelector('.vcount span').textContent = n + ' of ' + MAX_LINES + ' picked.';
    picks.forEach(function (p) {
      if (p.value === 'OWN') return;
      p.disabled = !p.checked && n >= MAX_LINES;
      lineEl(p).classList.toggle('off', p.disabled);
    });
  }
  picks.forEach(function (p) {
    p.addEventListener('change', function () {
      var item = lineEl(p);
      if (p.checked) {
        if (!item.rec) item.rec = makeRecorder(item, p.value);
        item.rec.el.hidden = false;
      } else if (item.rec) {
        item.rec.stop();
        item.rec.el.hidden = true;
      }
      if (p.value === 'OWN') form.querySelector('.vown').hidden = !p.checked;
      countPicks();
    });
  });

  // ---- One recorder per picked line ----
  function fmt(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function pickType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    var t = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < t.length; i++) if (MediaRecorder.isTypeSupported(t[i])) return t[i];
    return '';
  }

  function makeRecorder(item, lineId) {
    var el = document.createElement('div');
    el.className = 'rec';
    el.innerHTML =
      '<button type="button" class="rb"><span class="dot"></span><span class="rl">Record</span></button>' +
      '<span class="rt">0:00</span>' +
      '<audio controls preload="metadata" hidden></audio>' +
      '<label class="up">or upload a file<input type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm"></label>';
    // The recorder sits after the label so pressing its buttons does not untick the line.
    item.insertAdjacentElement('afterend', el);

    var btn = el.querySelector('.rb'), label = el.querySelector('.rl'), timer = el.querySelector('.rt');
    var audio = el.querySelector('audio'), file = el.querySelector('input[type=file]');
    var rec = null, stream = null, chunks = [], started = 0, tick = 0;
    var state = { el: el, clip: null, line: lineId, stop: stop };

    function setClip(blob, mime) {
      if (audio.src) URL.revokeObjectURL(audio.src);
      state.clip = { blob: blob, mime: mime };
      audio.src = URL.createObjectURL(blob);
      audio.hidden = false;
      item.classList.add('done');
      label.textContent = 'Record again';
    }
    function stop() {
      if (rec && rec.state !== 'inactive') rec.stop();
    }
    function finish() {
      clearInterval(tick);
      btn.classList.remove('on');
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }

    btn.addEventListener('click', function () {
      if (rec && rec.state === 'recording') { stop(); return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        say('This browser cannot record here. Open the page in Safari or Chrome, or upload a recording.', true);
        return;
      }
      say('');
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s;
        chunks = [];
        var type = pickType();
        rec = type ? new MediaRecorder(s, { mimeType: type }) : new MediaRecorder(s);
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          finish();
          var mime = rec.mimeType || type || 'audio/webm';
          if (chunks.length) setClip(new Blob(chunks, { type: mime }), mime);
          else label.textContent = 'Record';
        };
        rec.start();
        started = Date.now();
        btn.classList.add('on');
        label.textContent = 'Stop';
        timer.textContent = '0:00';
        tick = setInterval(function () {
          var secs = (Date.now() - started) / 1000;
          timer.textContent = fmt(secs);
          if (secs >= MAX_SECONDS) stop();
        }, 250);
      }).catch(function () {
        finish();
        say('We could not use your microphone. Allow it in your browser settings, or upload a recording instead.', true);
      });
    });

    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var ext = (f.name.split('.').pop() || '').toLowerCase();
      var mime = (f.type && /^(audio|video)\//.test(f.type)) ? f.type : EXT_TYPES[ext];
      if (!mime) { say('That file is not an audio recording we can use. Try m4a, mp3 or wav.', true); file.value = ''; return; }
      if (f.size > MAX_BYTES) { say('That file is over 10 MB. Please send a shorter recording.', true); file.value = ''; return; }
      stop();
      timer.textContent = '';
      say('');
      setClip(f, mime);
    });

    return state;
  }

  // ---- Sending ----
  function toBase64(blob) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = fail;
      r.readAsDataURL(blob);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sendBtn.disabled) return;
    var f = form.elements;
    var chosen = [];
    picks.forEach(function (p) { if (p.checked) chosen.push(lineEl(p).rec); });

    if (!chosen.length) return say('Pick at least one line and record it.', true);
    for (var i = 0; i < chosen.length; i++) {
      if (!chosen[i].clip) {
        chosen[i].el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return say('One of your picked lines has no recording yet.', true);
      }
    }
    var ownText = f.ownText.value.trim();
    if (form.querySelector('input[value=OWN]').checked && !ownText) return say('Type the words of your own line.', true);
    if (!f.creditName.value.trim()) { f.creditName.focus(); return say('Add the name you want in the credits.', true); }
    if (!f.email.checkValidity() || !f.email.value.trim()) { f.email.focus(); return say('Add a working email address.', true); }
    if (!f.agree.checked) return say('Please tick the box to agree to the Fleet Voices release.', true);
    if (!f.adult.checked) return say('Please confirm you are 18 or older. We can only take recordings from adults.', true);

    sendBtn.disabled = true;
    say('Sending your recordings…');
    Promise.all(chosen.map(function (c) {
      return toBase64(c.clip.blob).then(function (data) { return { line: c.line, mime: c.clip.mime, data: data }; });
    })).then(function (clips) {
      return fetch(endpoint, {
        method: 'POST',
        // Plain text keeps the request simple for the Apps Script web app.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          release: form.dataset.release,
          agree: f.agree.checked,
          adult: f.adult.checked,
          creditName: f.creditName.value.trim(),
          credit: form.querySelector('input[name=credit]:checked').value,
          email: f.email.value.trim(),
          discord: f.discord.value.trim(),
          ownText: form.querySelector('input[value=OWN]').checked ? ownText : '',
          website: f.website.value,
          page: location.href,
          ua: navigator.userAgent.slice(0, 200),
          clips: clips
        })
      });
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || '');
      form.hidden = true;
      var done = document.querySelector('.vdone');
      done.querySelector('.vid-out').textContent = res.id;
      done.hidden = false;
      done.focus();
      done.scrollIntoView({ block: 'center' });
    }).catch(function (err) {
      sendBtn.disabled = false;
      say((err && err.message) || 'Sending failed. Check your connection and try again.', true);
    });
  });

  // An old warning goes away as soon as the person changes something.
  form.addEventListener('change', function () { if (msg.classList.contains('bad')) say(''); });

  countPicks();
})();
