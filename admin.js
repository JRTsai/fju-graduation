// 管理模式：管理者以 Supabase 帳號登入後，可修改或刪除照片與留言。
// 權限由 Supabase 端的 RLS policy 把關（見 admin-setup.sql），前端只負責介面。
(() => {
  const G = window.GW, $ = id => document.getElementById(id), app = $('app');
  if (!G || G.DEMO || !G.db) { $('adminLink').classList.add('hidden'); return; }
  const db = G.db;
  let editing = null;

  const open = id => $(id).classList.remove('hidden');
  const close = id => $(id).classList.add('hidden');
  document.querySelectorAll('#loginOverlay,#listOverlay,#editOverlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) close(ov.id); });
  });
  const showErr = (id, text) => { $(id).textContent = text; $(id).classList.toggle('hidden', !text); };

  // ---------- 登入狀態 ----------
  function setAdmin(on, email) {
    app.classList.toggle('is-admin', on);
    $('adminBar').classList.toggle('hidden', !on);
    $('adminEmail').textContent = email || '';
    $('adminLink').textContent = on ? '🔓 管理中' : '🔒 管理';
  }
  async function verify() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return setAdmin(false);
    const { data, error } = await db.rpc('is_admin');
    if (!error && data === true) return setAdmin(true, session.user.email);
    setAdmin(false);
    await db.auth.signOut();
    G.toast(error ? '管理功能尚未設定（請執行 admin-setup.sql）' : '這個帳號沒有管理權限');
  }

  $('adminLink').addEventListener('click', () => {
    if (app.classList.contains('is-admin')) return openList();
    showErr('loginError', ''); open('loginOverlay');
    setTimeout(() => $('loginForm').elements.namedItem('email').focus(), 50);
  });
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget, btn = $('loginBtn');
    btn.disabled = true; btn.firstElementChild.textContent = '登入中…'; showErr('loginError', '');
    const { error } = await db.auth.signInWithPassword({
      email: f.elements.namedItem('email').value.trim(),
      password: f.elements.namedItem('password').value
    });
    btn.disabled = false; btn.firstElementChild.textContent = '登入';
    if (error) return showErr('loginError', 'Email 或密碼錯誤');
    f.reset(); close('loginOverlay');
    await verify();
    if (app.classList.contains('is-admin')) G.toast('已進入管理模式');
  });
  $('adminLogout').addEventListener('click', async () => {
    await db.auth.signOut(); setAdmin(false); G.toast('已登出管理模式');
  });

  // ---------- 修改 ----------
  function openEdit(p) {
    if (!p) return G.toast('目前沒有可編輯的內容');
    editing = p;
    const f = $('editForm');
    f.elements.namedItem('name').value = p.name;
    f.elements.namedItem('message').value = p.message;
    $('editRemovePhoto').checked = false;
    $('editPhoto').classList.toggle('hidden', !p.photo_url);
    $('editRemoveWrap').classList.toggle('hidden', !p.photo_url);
    if (p.photo_url) $('editPhoto').src = p.thumb_url || p.photo_url;
    showErr('editError', ''); open('editOverlay');
  }
  $('editForm').addEventListener('submit', async e => {
    e.preventDefault();
    const p = editing, f = e.currentTarget, btn = $('editSave');
    const name = f.elements.namedItem('name').value.trim().slice(0, 30) || '匿名同學';
    const message = f.elements.namedItem('message').value.trim().slice(0, 300);
    const dropPhoto = $('editRemovePhoto').checked;
    if ((dropPhoto || !p.photo) && !message) return showErr('editError', '沒有照片時，留言不能空白');
    const patch = { name, message };
    if (dropPhoto) { patch.photo = null; patch.thumb = null; }
    btn.disabled = true;
    const { data, error } = await db.from('posts').update(patch).eq('id', p.id).select();
    btn.disabled = false;
    if (error || !data || !data.length) return showErr('editError', '儲存失敗：沒有權限或資料已不存在');
    if (dropPhoto) await db.storage.from(G.BUCKET).remove([p.photo, p.thumb].filter(Boolean));
    G.replacePost(G.normalize(data[0]));
    close('editOverlay'); G.toast('已儲存修改'); refreshList();
  });

  // ---------- 刪除 ----------
  async function remove(p) {
    if (!p) return G.toast('目前沒有可刪除的內容');
    if (!confirm(`確定刪除「${p.name}」的${p.photo ? '照片與' : ''}留言？\n刪除後無法復原。`)) return false;
    const { error, count } = await db.from('posts').delete({ count: 'exact' }).eq('id', p.id);
    if (error || !count) { G.toast('刪除失敗：沒有權限或資料已不存在'); return false; }
    if (p.photo || p.thumb) await db.storage.from(G.BUCKET).remove([p.photo, p.thumb].filter(Boolean));
    G.removePost(p.id); G.toast('已刪除'); refreshList();
    return true;
  }
  $('editDelete').addEventListener('click', async () => { if (await remove(editing)) close('editOverlay'); });

  $('admEditPhoto').addEventListener('click', () => openEdit(G.currentPhoto()));
  $('admDelPhoto').addEventListener('click', () => remove(G.currentPhoto()));
  $('admEditMsg').addEventListener('click', () => openEdit(G.currentMessage()));
  $('admDelMsg').addEventListener('click', () => remove(G.currentMessage()));

  // ---------- 全部貼文清單 ----------
  async function refreshList() {
    if ($('listOverlay').classList.contains('hidden')) return;
    const box = $('admList');
    const { data, error } = await db.from('posts').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) { box.textContent = '讀取失敗，請稍後再試'; return; }
    $('listCount').textContent = `（${data.length} 則）`;
    box.textContent = '';
    if (!data.length) { box.textContent = '目前沒有任何貼文。'; return; }
    for (const row of data) {
      const p = G.normalize(row);
      const item = document.createElement('div'); item.className = 'adm-item';
      if (p.thumb_url) {
        const im = document.createElement('img'); im.src = p.thumb_url; im.alt = ''; im.loading = 'lazy'; item.append(im);
      } else {
        const ph = document.createElement('span'); ph.className = 'adm-noimg'; ph.textContent = '💬'; item.append(ph);
      }
      const text = document.createElement('div'); text.className = 'adm-text';
      const b = document.createElement('b'); b.textContent = p.name;
      const time = document.createElement('small');
      time.textContent = new Date(p.created).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + (G.HIDDEN.has(p.id) ? ' · 網頁上已隱藏' : '');
      const msg = document.createElement('p'); msg.textContent = p.message || '（只有照片）';
      text.append(b, time, msg);
      const acts = document.createElement('div'); acts.className = 'adm-acts';
      const eb = document.createElement('button'); eb.className = 'adm-btn'; eb.textContent = '✎ 編輯'; eb.onclick = () => openEdit(p);
      const db_ = document.createElement('button'); db_.className = 'adm-btn danger'; db_.textContent = '🗑 刪除'; db_.onclick = () => remove(p);
      acts.append(eb, db_);
      item.append(text, acts);
      box.append(item);
    }
  }
  function openList() { open('listOverlay'); $('admList').textContent = '讀取中…'; refreshList(); }
  $('adminListBtn').addEventListener('click', openList);

  db.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') setAdmin(false); });
  if (location.hash === '#admin') $('adminLink').click();
  verify();
})();
