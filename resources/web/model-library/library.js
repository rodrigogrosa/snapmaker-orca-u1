/* Independent U1 library. No catalog scraping, downloads, or print commands. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (location.pathname.includes('/flutter_web/') && params.get('path') !== '0') return;
  if (document.getElementById('u1-model-library')) return;
  const sites = [
    { id: 'printables', name: 'Printables', letter: 'P', color: '#ee6a35', desc: 'Peças úteis, organização e ideias para o dia a dia.', home: 'https://www.printables.com/', search: q => `https://www.printables.com/search/models?q=${encodeURIComponent(q)}` },
    { id: 'makerworld', name: 'MakerWorld', letter: 'M', color: '#168456', desc: 'Explore projetos criativos e modelos com várias cores.', home: 'https://makerworld.com/', search: q => `https://makerworld.com/en/search/models?keyword=${encodeURIComponent(q)}` },
    { id: 'thingiverse', name: 'Thingiverse', letter: 'T', color: '#2879c4', desc: 'Acessórios, mecanismos e projetos da comunidade.', home: 'https://www.thingiverse.com/', search: q => `https://www.thingiverse.com/search?q=${encodeURIComponent(q)}&type=things` }
  ];
  const key = 'u1-lab:model-links:v1';
  const host = document.createElement('div');
  host.id = 'u1-model-library';
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../model-library/library.css', document.currentScript.src).href;
  root.append(stylesheet);
  const content = document.createElement('div');
  // Only constant markup is inserted as HTML. User values use textContent.
  content.innerHTML = `
    <button class="launcher" type="button" aria-haspopup="dialog">◇ Explorar modelos</button>
    <dialog aria-labelledby="library-title">
      <div class="panel">
        <header><span class="brand">U1 / LAB <span class="badge">EXPERIMENTAL</span></span><button class="close" aria-label="Fechar biblioteca" type="button">✕</button></header>
        <section class="hero"><span class="eyebrow">DA IDEIA À SUA MESA DE IMPRESSÃO</span><h1 id="library-title">Sua próxima criação<br>começa aqui.</h1><p>Encontre modelos em outras comunidades e guarde suas próximas ideias.</p></section>
        <form class="search"><label class="sr-only" for="query">O que você quer imprimir?</label><input id="query" type="search" maxlength="200" placeholder="O que você quer imprimir? Ex.: organizador" autocomplete="off"><button class="primary" type="submit">Buscar no Printables ↗</button></form>
        <div class="suggestions"><span>Experimente</span><button type="button" data-query="desk organizer">Organização</button><button type="button" data-query="planter">Vasos</button><button type="button" data-query="snapmaker u1">Para sua U1</button><button type="button" data-query="multicolor">Multicoloridos</button></div>
        <div class="section-heading"><h2>Explore as comunidades</h2><span>Os resultados abrem no navegador</span></div>
        <div class="sites"></div>
        <section class="saved"><div class="section-heading"><h2>Ideias salvas <span class="count">0</span></h2><button type="button" class="add-link">+ Salvar um link</button></div>
          <form class="bookmark-form" hidden><label>Nome do projeto<input name="title" required maxlength="120" placeholder="Ex.: Organizador de ferramentas"></label><label>Link do modelo<input name="url" type="url" required maxlength="2048" placeholder="https://..."></label><div><button type="submit" class="primary">Salvar ideia</button> <button type="button" class="cancel">Cancelar</button></div></form>
          <p class="status" role="status" aria-live="polite"></p><div class="bookmarks"></div>
        </section>
        <footer><div><strong>Encontrou um modelo?</strong><p>Baixe o STL ou 3MF, volte ao Orca e importe com o perfil Snapmaker U1. Confira cores, materiais e a prévia antes de imprimir.</p></div><button type="button" class="back">Voltar ao Orca →</button></footer>
      </div>
    </dialog>`;
  root.append(content);
  const $ = selector => root.querySelector(selector);
  const dialog = $('dialog');
  const status = $('.status');
  let bookmarks = [];
  const allowedURL = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(saved) || saved.some(item => !item || typeof item.title !== 'string' || typeof item.url !== 'string' || !allowedURL(item.url))) throw new Error('invalid bookmarks');
    bookmarks = saved;
  } catch {
    status.textContent = 'Não foi possível ler as ideias salvas. O conteúdo existente não será substituído.';
    $('.add-link').disabled = true;
  }
  function openExternal(value) {
    const url = allowedURL(value);
    if (!url) return;
    if (window.wx && typeof window.wx.postMessage === 'function') {
      window.wx.postMessage(JSON.stringify({ sequence_id: String(Date.now()), command: 'common_openurl', url }));
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
  function save(next) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      bookmarks = next;
      status.textContent = '';
      renderBookmarks();
      return true;
    } catch {
      status.textContent = 'Não foi possível salvar neste navegador. Suas ideias anteriores foram mantidas.';
      return false;
    }
  }
  function renderBookmarks() {
    const list = $('.bookmarks');
    list.replaceChildren();
    $('.count').textContent = bookmarks.length;
    if (!bookmarks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Uma boa ideia merece ser guardada. Salve o link de um modelo para encontrá-lo depois.';
      list.append(empty);
      return;
    }
    bookmarks.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'bookmark';
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'bookmark-link';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const domain = document.createElement('span');
      domain.textContent = new URL(item.url).hostname;
      link.append(title, domain);
      link.addEventListener('click', () => openExternal(item.url));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.textContent = 'Remover';
      remove.setAttribute('aria-label', `Remover ${item.title}`);
      remove.addEventListener('click', () => save(bookmarks.filter((_, i) => i !== index)));
      row.append(link, remove);
      list.append(row);
    });
  }
  for (const site of sites) {
    const card = document.createElement('article');
    card.className = 'site';
    card.style.setProperty('--site-color', site.color);
    const icon = document.createElement('span');
    icon.className = 'site-icon';
    icon.textContent = site.letter;
    const name = document.createElement('h3');
    name.textContent = site.name;
    const desc = document.createElement('p');
    desc.textContent = site.desc;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.site = site.id;
    button.textContent = `Explorar ${site.name} ↗`;
    button.addEventListener('click', () => {
      const q = $('#query').value.trim();
      openExternal(q ? site.search(q) : site.home);
    });
    card.append(icon, name, desc, button);
    $('.sites').append(card);
  }
  function show() { if (!dialog.open) dialog.showModal(); $('#query').focus(); }
  function close() { dialog.close(); $('.launcher').focus(); }
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  $('.launcher').addEventListener('click', show);
  $('.close').addEventListener('click', close);
  $('.back').addEventListener('click', close);
  $('.search').addEventListener('submit', event => {
    event.preventDefault();
    const q = $('#query').value.trim();
    openExternal(q ? sites[0].search(q) : sites[0].home);
  });
  $('#query').addEventListener('input', () => {
    const q = $('#query').value.trim();
    for (const site of sites) $(`[data-site="${site.id}"]`).textContent = `${q ? 'Buscar no' : 'Explorar'} ${site.name} ↗`;
  });
  root.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => {
    $('#query').value = button.dataset.query;
    $('#query').dispatchEvent(new Event('input'));
    $('#query').focus();
  }));
  const form = $('.bookmark-form');
  $('.add-link').addEventListener('click', () => { form.hidden = false; form.elements.title.focus(); });
  $('.cancel').addEventListener('click', () => { form.hidden = true; form.reset(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = form.elements.title.value.trim();
    const url = allowedURL(form.elements.url.value.trim());
    if (!title || !url) { status.textContent = 'Informe um nome e um link HTTPS válido, sem usuário ou senha.'; return; }
    if (bookmarks.some(item => item.url === url)) { status.textContent = 'Este link já está nas suas ideias salvas.'; return; }
    if (save([...bookmarks, { title, url }])) { form.hidden = true; form.reset(); }
  });
  renderBookmarks();
  if (params.get('library') === '1') show();
})();
