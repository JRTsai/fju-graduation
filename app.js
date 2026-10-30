(() => {
  const cfg = window.APP_CONFIG || {};
  const DEMO = !cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase;
  const BUCKET = cfg.bucket || 'photos';
  const PHOTO_MS = 6000;   // 照片輪播間隔
  const MSG_MS = 7000;     // 留言輪播間隔
  const IDLE_MS = 10000;   // 點選／新上傳照片停留 10 秒後回到輪播
  const THEME_MS = 30000;  // 風格輪替
  const POLL_MS = 15000;   // 即時連線之外的備援重新整理

  const db = DEMO ? null : window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const $ = id => document.getElementById(id);
  const app = $('app');

  const S = {
    posts: [], index: 0, mi: 0, selected: null, selectedIsNew: false,
    paused: false, theme: 0, autoTheme: true, screen: false,
    photoStart: Date.now(), msgStart: Date.now(), themeStart: Date.now(),
    lastActivity: Date.now(), pausedAt: 0, connected: false, stripKey: ''
  };
  const photos = () => S.posts.filter(p => p.photo_url);
  const messages = () => S.posts.filter(p => p.message);
  const current = () => S.selected || photos()[S.index % Math.max(photos().length, 1)] || null;

  function normalize(row) {
    let url = null;
    if (row.photo_url) url = row.photo_url;
    else if (row.photo) url = db.storage.from(BUCKET).getPublicUrl(row.photo).data.publicUrl;
    return { id: row.id, name: row.name || '匿名同學', message: row.message || '', photo_url: url, created: new Date(row.created_at || Date.now()).getTime() };
  }

  // ---------- data ----------
  async function load() {
    if (DEMO) return setConnected(true);
    const { data, error } = await db.from('posts').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) return setConnected(false);
    const known = new Set(S.posts.map(p => p.id));
    const next = data.map(normalize);
    const fresh = S.posts.length ? next.find(p => !known.has(p.id) && p.photo_url) : null;
    S.posts = next;
    setConnected(true);
    if (fresh) spotlight(fresh); else renderAll();
  }

  function addPost(post, own) {
    if (S.posts.some(p => p.id === post.id)) return;
    S.posts.unshift(post);
    if (post.photo_url) spotlight(post, own); else renderAll();
  }

  function subscribe() {
    if (DEMO) return;
    db.channel('posts-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, ({ new: row }) => addPost(normalize(row)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, ({ old }) => {
        S.posts = S.posts.filter(p => p.id !== old.id);
        if (S.selected && S.selected.id === old.id) S.selected = null;
        renderAll();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setConnected(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnected(false);
      });
    setInterval(load, POLL_MS);
  }

  function setConnected(ok) {
    S.connected = ok;
    $('liveDot').classList.toggle('off', !ok);
    $('liveText').textContent = ok ? (DEMO ? 'DEMO · 示範模式' : 'LIVE MOMENTS') : '連線恢復中…';
  }

  // ---------- selection ----------
  function select(post) {
    S.selected = post; S.selectedIsNew = false;
    S.lastActivity = Date.now();
    renderAll();
  }
  function spotlight(post, own) {
    // 新上傳的照片立刻放大顯示 10 秒，之後回到全部照片輪播
    S.selected = post; S.selectedIsNew = true;
    S.lastActivity = Date.now();
    renderAll();
    if (own) toast('已送出！謝謝你，把這一刻留給我們。');
  }

  // ---------- render ----------
  function renderAll() { renderStage(); renderStrip(); renderMessage(); }

  function renderStage() {
    const list = photos(), p = current();
    $('photoCount').textContent = `${list.length} 張共同回憶`;
    const img = $('mainPhoto');
    $('emptyArt').classList.toggle('hidden', !!p);
    img.classList.toggle('hidden', !p);
    $('caption').classList.toggle('hidden', !p);
    if (!p) return;
    if (img.dataset.id !== p.id) {
      img.dataset.id = p.id;
      img.src = p.photo_url;
      img.alt = p.name + ' 的畢業照片';
      img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    }
    $('capName').textContent = p.name;
    $('capMsg').textContent = p.message || '青春裡，最值得收藏的一刻。';
    $('capInfo').textContent = S.selected ? '觀看中 · 10 秒後回到輪播' : `${S.index % list.length + 1} / ${list.length}`;
    const pill = $('pill');
    pill.textContent = S.selected ? (S.selectedIsNew ? '✦ 剛剛上傳' : '正在觀看') : (S.paused ? '已暫停' : '回憶放映中');
    pill.classList.toggle('new', !!(S.selected && S.selectedIsNew));
    document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('active', t.dataset.id === p.id));
  }

  function renderStrip() {
    const list = photos(), strip = $('strip');
    const key = list.map(p => p.id).join(',');
    if (key === S.stripKey) return renderStage();
    S.stripKey = key;
    strip.textContent = '';
    if (!list.length) {
      const msg = document.createElement('p');
      msg.textContent = '你的每一張照片，都會成為這段青春的一部分。';
      strip.append(msg);
      return;
    }
    const now = Date.now();
    for (const p of list) {
      const b = document.createElement('button');
      b.className = 'thumb' + (now - p.created < 60000 ? ' fresh' : '');
      b.dataset.id = p.id;
      b.setAttribute('aria-label', '觀看 ' + p.name + ' 的照片');
      const im = document.createElement('img');
      im.src = p.photo_url; im.alt = p.name; im.loading = 'lazy';
      b.append(im);
      b.addEventListener('click', () => select(p));
      strip.append(b);
    }
    const cur = current();
    document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('active', !!cur && t.dataset.id === cur.id));
  }

  function renderMessage() {
    const list = messages(), box = $('msgContent');
    if (!list.length) return;
    const m = list[S.mi % list.length];
    if (box.dataset.id === m.id) { $('msgCount').textContent = `${S.mi % list.length + 1} / ${list.length} 則祝福`; return; }
    box.dataset.id = m.id;
    box.textContent = '';
    const p = document.createElement('p'); p.textContent = m.message;
    const author = document.createElement('span'); author.className = 'author';
    const avatar = document.createElement('span'); avatar.textContent = [...m.name][0] || '輔';
    const b = document.createElement('b'); b.textContent = m.name;
    const small = document.createElement('small'); small.textContent = '給一起走過的我們';
    b.append(small); author.append(avatar, b); box.append(p, author);
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    $('msgCount').textContent = `${S.mi % list.length + 1} / ${list.length} 則祝福`;
    const n = Math.min(list.length, 5), at = S.mi % list.length % n;
    $('msgDots').textContent = Array.from({ length: n }, (_, i) => i === at ? '●' : '○').join(' ');
  }

  function setTheme(t) {
    S.theme = t; app.dataset.theme = t;
    document.querySelectorAll('[data-theme-btn]').forEach(b => b.classList.toggle('chosen', +b.dataset.themeBtn === t));
  }

  // ---------- timers ----------
  function tick() {
    const now = Date.now();
    if (S.selected) {
      const left = now - S.lastActivity;
      $('bar').style.width = Math.min(100, left / IDLE_MS * 100) + '%';
      if (left >= IDLE_MS) { S.selected = null; S.selectedIsNew = false; S.photoStart = now; renderStage(); }
    } else if (!S.paused) {
      const el = now - S.photoStart;
      $('bar').style.width = Math.min(100, el / PHOTO_MS * 100) + '%';
      if (el >= PHOTO_MS && photos().length) { S.index = (S.index + 1) % photos().length; S.photoStart = now; renderStage(); }
    }
    if (!S.paused && now - S.msgStart >= MSG_MS) { S.mi++; S.msgStart = now; renderMessage(); }
    if (S.autoTheme && !S.paused && now - S.themeStart >= THEME_MS) { setTheme((S.theme + 1) % 3); S.themeStart = now; }
  }

  // ---------- upload ----------
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const ratio = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * ratio); c.height = Math.round(bmp.height * ratio);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
      if (blob) return blob;
    } catch (_) { /* fall through */ }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('此照片格式無法讀取，請選 JPG 或 PNG');
    return file;
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget, btn = $('submitBtn'), err = $('error');
    const name = (form.elements.namedItem('name').value || '').trim().slice(0, 30) || '匿名同學';
    const message = (form.elements.namedItem('message').value || '').trim().slice(0, 300);
    const file = $('file').files[0];
    err.classList.add('hidden');
    if (!message && !file) { err.textContent = '請上傳照片或寫下祝福'; err.classList.remove('hidden'); return; }
    btn.disabled = true; btn.firstElementChild.textContent = '正在送出，請稍候…';
    try {
      if (file && file.size > 25e6) throw Error('原始照片請小於 25 MB');
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
      let blob = file ? await shrink(file) : null;
      if (DEMO) {
        addPost({ id, name, message, photo_url: blob ? URL.createObjectURL(blob) : null, created: Date.now() }, true);
      } else {
        let path = null;
        if (blob) {
          const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
          path = `${id}.${ext}`;
          const up = await db.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
          if (up.error) throw Error('照片上傳失敗，請再試一次');
        }
        const row = { id, name, message, photo: path };
        const { error } = await db.from('posts').insert(row);
        if (error) {
          if (path) await db.storage.from(BUCKET).remove([path]);
          throw Error('送出失敗，請稍後重試');
        }
        addPost(normalize({ ...row, created_at: new Date().toISOString() }), true);
      }
      if (!blob) toast('已送出！謝謝你的祝福。');
      btn.disabled = false;
      closeUpload(true);
    } catch (ex) {
      err.textContent = ex.message || '連線失敗，請重試';
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.firstElementChild.textContent = '送出這份回憶';
    }
  }

  // ---------- UI wiring ----------
  function openUpload() { $('overlay').classList.remove('hidden'); $('error').classList.add('hidden'); }
  function closeUpload(reset) {
    if ($('submitBtn').disabled) return;
    $('overlay').classList.add('hidden');
    if (reset) { $('form').reset(); clearPreview(); }
  }
  function clearPreview() {
    const pv = $('preview');
    if (pv.src) URL.revokeObjectURL(pv.src);
    pv.removeAttribute('src'); pv.classList.add('hidden');
    $('uploadHint').classList.remove('hidden'); $('removePhoto').classList.add('hidden');
    $('file').value = '';
  }
  let toastTimer;
  function toast(text) {
    $('toastText').textContent = text; $('toast').classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 5000);
  }

  document.querySelectorAll('[data-open-upload]').forEach(b => b.addEventListener('click', openUpload));
  $('closeBtn').addEventListener('click', () => closeUpload(false));
  $('overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeUpload(false); });
  $('form').addEventListener('submit', submit);
  $('file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return clearPreview();
    const pv = $('preview');
    if (pv.src) URL.revokeObjectURL(pv.src);
    pv.src = URL.createObjectURL(f); pv.classList.remove('hidden');
    $('uploadHint').classList.add('hidden'); $('removePhoto').classList.remove('hidden');
  });
  $('removePhoto').addEventListener('click', clearPreview);
  $('toastClose').addEventListener('click', () => $('toast').classList.add('hidden'));
  $('stage').addEventListener('click', e => {
    // 觸碰主畫面：若正在輪播，停在目前這張觀看 10 秒
    if (e.target.closest('button')) return;
    const p = current();
    if (p && !S.selected) select(p);
  });
  $('pauseBtn').addEventListener('click', () => {
    const now = Date.now();
    if (S.paused) { S.photoStart += now - S.pausedAt; S.msgStart += now - S.pausedAt; S.themeStart += now - S.pausedAt; }
    else S.pausedAt = now;
    S.paused = !S.paused;
    $('pauseBtn').innerHTML = `<svg class="ic"><use href="#i-${S.paused ? 'play' : 'pause'}"/></svg>`;
    $('pauseBtn').setAttribute('aria-label', S.paused ? '繼續輪播' : '暫停輪播');
    renderStage();
  });
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => { if (S.selected) S.lastActivity = Date.now(); }));
  $('screenBtn').addEventListener('click', () => {
    S.screen = !S.screen;
    app.classList.toggle('screen', S.screen);
    $('screenBtn').lastElementChild.textContent = S.screen ? '返回一般模式' : '大螢幕模式';
    if (S.screen) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.();
  });
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.addEventListener('click', () => {
    setTheme(+b.dataset.themeBtn); S.autoTheme = false; $('autoThemeBtn').classList.remove('chosen');
  }));
  $('autoThemeBtn').addEventListener('click', () => {
    S.autoTheme = !S.autoTheme; S.themeStart = Date.now();
    $('autoThemeBtn').classList.toggle('chosen', S.autoTheme);
  });
  const shareUrl = location.href.split('#')[0].split('?')[0];
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl); $('copyBtn').textContent = '✓ 已複製連結'; setTimeout(() => $('copyBtn').textContent = '複製參與連結，分享給同學', 2000); }
    catch { toast('分享網址：' + shareUrl); }
  });
  if (window.QRCode) new QRCode($('qr'), { text: shareUrl, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M });

  if (DEMO) {
    const note = document.createElement('div');
    note.className = 'demo-banner';
    note.textContent = '示範模式：尚未設定 Supabase（config.js），上傳內容只會暫存在這個分頁。設定完成後即可多人即時同步。';
    document.querySelector('.intro').after(note);
  }

  // 隨風飄落的花瓣
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const box = $('petals'), n = innerWidth < 650 ? 10 : 18;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'petal';
      const r = (a, b) => a + Math.random() * (b - a);
      p.style.cssText = `left:${r(-10, 95)}%;--s:${r(8, 16)}px;--d:${r(14, 26)}s;--delay:${r(-26, 0)}s;--f:${r(1.2, 2.6)}s;--drift:${r(15, 40)}vw`;
      p.append(document.createElement('i'));
      box.append(p);
    }
  }

  setTheme(0);
  setConnected(DEMO);
  load().then(subscribe);
  setInterval(tick, 200);
})();
