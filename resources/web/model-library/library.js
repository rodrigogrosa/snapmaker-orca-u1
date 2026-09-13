/* U1 Lab home. Provider content is text/data, never executable remote markup. */
(() => {
  'use strict';
  // Old Flutter bundles may still reference this script. Never overlay their UI.
  if (!location.pathname.endsWith('/model-library/index.html')) return;
  const $ = s => document.querySelector(s);
  const status = $('#status');
  const pending = new Map();
  let serial = 0, generation = 0, provider = 'snapmaker', view = 'catalog', page = 1;
  let catalog = [], filtered = [], favorites = [], connected = false, total = 0, previousView = 'catalog';
  let lastThingiverseQuery = null;
  let storageOK = false, busy = false, catalogComplete = false, catalogRun = null;
  const format = n => Number(n).toLocaleString('pt-BR');
  function native(command, data = {}) {
    if (!window.wx?.postMessage) throw new Error('Abra esta biblioteca pelo U1 Lab para conectar os catálogos.');
    window.wx.postMessage(JSON.stringify({command, sequence_id: String(Date.now()), ...data}));
  }
  function request(command, data = {}) {
    return new Promise((resolve, reject) => {
      const id = String(++serial);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('A consulta demorou mais que o esperado. Tente novamente.')); }, ['u1_import','u1_download_file','u1_open_downloads'].includes(command) ? 180000 : 35000);
      pending.set(id, {resolve, reject, timer});
      try { native(command, {...data, id}); } catch (e) { clearTimeout(timer); pending.delete(id); reject(e); }
    });
  }
  window.u1LibraryResponse = result => {
    const item = pending.get(result.id);
    if (!item) return;
    pending.delete(result.id); clearTimeout(item.timer);
    result.ok ? item.resolve(result.data) : item.reject(new Error(result.error || 'Não foi possível concluir a operação.'));
  };
  function say(text) { status.textContent = text; }
  function button(label, action, cls = '') {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = cls;
    b.addEventListener('click', action); return b;
  }
  function show(next) {
    view = next;
    for (const name of ['catalog', 'favorites', 'recent', 'connections', 'detail']) $('#' + name).hidden = name !== next;
    document.querySelectorAll('nav button').forEach(b => b.dataset.view === next ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    $('h1').textContent = {catalog:'Biblioteca de modelos', favorites:'Modelos salvos', recent:'Arquivos recentes', connections:'Integrações', detail:'Detalhes do modelo'}[next];
    say('');
    if (next === 'favorites') cards($('#favorites .grid'), favorites);
    if (next === 'recent') { try { native('get_recent_projects'); } catch(e) {say(e.message);} }
  }
  function imageURL(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
  }
  function model(raw, source) {
    return {id:String(raw.id), provider:source, name:String(raw.name || 'Modelo sem título'),
      creator:String(source === 'snapmaker' ? raw.creator || 'Criador não informado' : raw.creator?.name || 'Criador não informado'),
      image:imageURL(source === 'snapmaker' ? raw.pic : raw.thumbnail), date:source === 'snapmaker' ? Number(raw.publishedDate) : Date.parse(raw.added), onlyGcode:raw.isOnlyGcode === true};
  }
  const same = (a,b) => a.id === b.id && a.provider === b.provider;
  async function save(item) {
    if (!storageOK) {say('Não foi possível acessar os modelos salvos. Reinicie a biblioteca antes de salvar.');return;}
    const next = favorites.some(m => same(m,item)) ? favorites.filter(m => !same(m,item)) : [...favorites,item];
    try {
      await request('u1_save_favorites', {items:next}); favorites = next;
      if(view === 'favorites') cards($('#favorites .grid'), favorites); else render();
    } catch(e) {say(e.message);}
  }
  function cards(container, items) {
    container.replaceChildren();
    if (!items.length) { const p = document.createElement('p');p.className='empty';p.textContent='Nenhum modelo encontrado nesta seleção.';container.append(p);return; }
    for (const item of items) {
      const article = document.createElement('article');article.className='card';
      const open = button('', () => detail(item), 'open-model');
      const img = document.createElement('img');img.referrerPolicy='no-referrer';img.loading='lazy';img.alt=''; if(item.image)img.src=item.image;
      img.addEventListener('error',()=>img.removeAttribute('src'), {once:true});
      const info = document.createElement('div');info.className='info';
      const source = document.createElement('div');source.className='source';source.textContent=item.provider === 'snapmaker' ? 'Snapmaker' : 'Thingiverse';
      const name=document.createElement('strong');name.textContent=item.name;
      const author=document.createElement('small');author.textContent=item.creator;
      info.append(source,name,author);open.append(img,info);
      const saved=favorites.some(m=>same(m,item));const star=button(saved?'♥':'♡',()=>save(item),'save');
      star.setAttribute('aria-label',`${saved?'Remover dos salvos':'Salvar'}: ${item.name}`);star.setAttribute('aria-pressed',String(saved));
      article.append(open,star);container.append(article);
    }
  }
  function field(parent, label, name, options, type = 'text') {
    const wrapper=document.createElement('label');wrapper.textContent=label;
    const input=document.createElement(options ? 'select':'input');input.name=name;input.setAttribute('aria-label',label);
    if(options)for(const [value,text] of options){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}
    else {input.type=type;input.maxLength=150;}
    wrapper.append(input);parent.append(wrapper);return input;
  }
  function filters(preserve=true) {
    const preserved=preserve?values():{};
    const normal=$('#provider-filters');normal.replaceChildren();const advanced=$('.advanced-fields');advanced.replaceChildren();
    $('#advanced').hidden=provider!=='thingiverse';
    if(provider==='snapmaker') {
      field(normal,'Ordenar por','sort',[['newest','Mais recentes'],['oldest','Mais antigos'],['name','Nome do modelo']]);
      field(normal,'Arquivos','file',[['','Todos'],['model','STL ou 3MF'],['gcode','Somente G-code']]);
      const authors=[...new Set(catalog.map(m=>m.creator))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
      field(normal,'Criador','author',[['','Todos os criadores'],...authors.map(a=>[a,a])]);
      $('#scope').textContent='Busca e filtros sobre o catálogo Snapmaker carregado. Títulos e descrições dos criadores são preservados no idioma original.';
    } else if(provider==='thingiverse') {
      field(normal,'Ordenar por','sort',[['relevant','Relevância'],['text','Correspondência do texto'],['popular','Popularidade'],['makes','Impressões da comunidade'],['newest','Mais recentes']]);
      if(!$('#query').value.trim())normal.querySelector('[name=sort]').value='newest';
      field(normal,'Resultados por página','per_page',[['100','100'],['50','50'],['20','20']]);
      for(const [name,label] of [['posted_after','Publicado após'],['posted_before','Publicado antes']])field(advanced,label,name,null,'date');
      for(const [name,label] of [['license','Código da licença'],['category_id','Identificador da categoria'],['subjects','Disciplinas (identificadores)'],['grades','Séries escolares (identificadores)'],['standards','Normas educacionais (identificadores)'],['liked_by','Curtido pelo usuário (identificador)'],['made_by','Impresso pelo usuário (identificador)']])field(advanced,label,name);
      for(const [name,label] of [['is_edu_approved','Aprovado para educação'],['customizable','Personalizável'],['show_customized','Incluir personalizações'],['has_makes','Com impressões da comunidade'],['is_featured','Em destaque'],['is_derivative','Remix'],['is_fis_challenge_winnereatured','Vencedor de desafio (experimental)']])field(advanced,label,name,[['','Padrão da plataforma'],['1','Sim'],['0','Não']]);
      $('#scope').textContent='Sem texto, explore os modelos mais recentes ou escolha Popularidade. Novas buscas começam em Relevância. Em Relevância, títulos com todas as palavras pesquisadas aparecem primeiro em cada página. Mais recentes prioriza a data e pode trazer correspondências na descrição. Filtro por cor ou quantidade de cores não está disponível neste catálogo.';
    } else $('#scope').textContent='Esta plataforma ainda não está conectada. Consulte Integrações para ver o motivo.';
    for(const input of normal.querySelectorAll('[name]'))if(preserved[input.name] !== undefined && [...input.options].some(o=>o.value===preserved[input.name]))input.value=preserved[input.name];
  }
  function values() {return Object.fromEntries([...$('#search').querySelectorAll('[name]')].map(x=>[x.name,x.value]));}
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function titleMatches(name, query) {
    const words=normalize(name).match(/[\p{L}\p{N}]+/gu) || [];
    const terms=normalize(query).match(/[\p{L}\p{N}]+/gu) || [];
    return terms.length>0 && terms.every(term=>words.includes(term));
  }
  function render() {
    if(provider==='snapmaker') {
      const f=values(),q=normalize($('#query').value.trim());
      filtered=catalog.filter(m=>(!q || q.split(/\s+/).every(word=>normalize(`${m.name} ${m.creator}`).includes(word))) && (!f.author || m.creator===f.author) && (!f.file || m.onlyGcode===(f.file==='gcode')));
      filtered.sort((a,b)=>f.sort==='name'?a.name.localeCompare(b.name,'pt-BR'):f.sort==='oldest'?a.date-b.date:b.date-a.date);
      total=filtered.length;
    }
    const size=provider==='snapmaker'?24:Number(values().per_page || 100);
    const pages=Math.max(1,Math.ceil(total/size));page=Math.min(page,pages);
    cards($('#results'),provider==='snapmaker'?filtered.slice((page-1)*size,page*size):filtered);
    const unavailable=provider!=='snapmaker' && (provider!=='thingiverse' || !connected);
    $('#connection-help').hidden=!unavailable;
    $('.pagination').hidden=unavailable;
    $('#refresh').hidden=unavailable;
    $('#results-title').textContent=unavailable?'Busca indisponível':`${format(total)} ${total===1?'modelo':'modelos'}`;
    if(unavailable) {
      $('#results').replaceChildren();
      $('#connection-reason').textContent=provider==='thingiverse'
        ? 'O Thingiverse ainda não está conectado. Sua pesquisa não foi enviada. Conecte seu aplicativo Thingiverse para buscar neste catálogo.'
        : 'Esta integração ainda não está disponível. Sua pesquisa não foi enviada. O catálogo Snapmaker está disponível nesta biblioteca.';
    }
    $('#page-label').textContent=`Página ${format(page)} de ${format(pages)}`;
    $('#previous').disabled=page<=1 || busy;$('#next').disabled=page>=pages || busy;
  }
  async function search(reset=true) {
    if(reset)page=1;
    // Filtering must not cancel the next page already being fetched.
    if(provider==='snapmaker' && catalogRun===generation && busy){render();return;}
    const run=++generation;busy=false;$('#refresh').disabled=false;
    if(provider==='snapmaker' && catalogComplete){say('');render();return;}
    if(['printables','makerworld'].includes(provider)){filtered=[];total=0;render();say('Integração ainda indisponível. Nenhuma busca foi enviada. Veja a seção Integrações.');return;}
    if(provider==='thingiverse' && !connected){filtered=[];total=0;render();say('Conecte seu aplicativo Thingiverse em Integrações para pesquisar aqui.');return;}
    busy=true;$('#refresh').disabled=true;say('Consultando o catálogo…');
    try {
      if(provider==='snapmaker') {
        catalogRun=run;catalogComplete=false;
        const loaded=[];let p=1;let count=Infinity;
        while(loaded.length<count && p<=100) {
          const response=await request('u1_search',{provider,page:p});if(run!==generation)return;
          if(!Array.isArray(response.data?.models))throw new Error('O formato do catálogo Snapmaker mudou.');
          const batch=response.data.models.map(x=>model(x,'snapmaker'));if(!batch.length)break;
          const before=loaded.length;for(const item of batch)if(!loaded.some(m=>same(m,item)))loaded.push(item);
          if(loaded.length===before)throw new Error('O catálogo repetiu a página. Tente atualizar mais tarde.');
          count=Number(response.page?.total ?? loaded.length);catalog=[...loaded];render();
          say(`Carregando ${format(loaded.length)} de ${format(count)} modelos…`);p++;
        }
        catalogComplete=true;filters();
      } else {
        const query=$('#query').value.trim();lastThingiverseQuery=query;
        const response=await request('u1_search',{provider,query,page,filters:values()});if(run!==generation)return;
        if(!Array.isArray(response.hits))throw new Error('O formato do catálogo Thingiverse mudou.');
        filtered=response.hits.map(x=>model(x,'thingiverse'));total=Number(response.total || 0);
        if(values().sort==='relevant') {
          const query=$('#query').value.trim();
          filtered.sort((a,b)=>Number(titleMatches(b.name,query))-Number(titleMatches(a.name,query)));
        }
      }
      say('');render();
    } catch(e){if(run===generation)say(e.message + (catalog.length && provider==='snapmaker'?' Os resultados carregados até agora foram mantidos.':''));}
    finally {if(run===generation){busy=false;$('#refresh').disabled=false;render();}}
  }
  function plain(html) {
    // Parse into an inert document, then retain only text. No links, images or remote script enter the page.
    const doc=new DOMParser().parseFromString(String(html || ''),'text/html');
    doc.querySelectorAll('script,style,iframe,object').forEach(el=>el.remove());
    doc.querySelectorAll('p,li,br,h1,h2,h3').forEach(el=>el.append('\n'));
    return doc.body.textContent.trim();
  }
  async function detail(item) {
    ++generation;busy=false;$('#refresh').disabled=false;previousView=view;show('detail');$('#detail-body').replaceChildren();say('Carregando detalhes…');
    const run=generation;
    try {
      const response=await request('u1_detail',{provider:item.provider,model_id:item.id});if(run!==generation || view!=='detail')return;
      const data=item.provider==='snapmaker'?response.data:response;
      const grid=document.createElement('div');grid.className='detail-grid';const img=document.createElement('img');img.referrerPolicy='no-referrer';img.alt='';
      const pic=imageURL(data.pics?.[0] || item.image);if(pic)img.src=pic;
      const info=document.createElement('div'),title=document.createElement('h2');title.textContent=String(data.name || item.name);
      const by=document.createElement('p');by.textContent=`${item.creator} · ${item.provider==='snapmaker'?'Snapmaker':'Thingiverse'}`;
      const rights=document.createElement('p');rights.className='muted';rights.textContent='Licença e atribuição: '+plain(typeof data.license==='string'?data.license:data.copyright?.content || 'Consulte as informações do criador.');
      const label=document.createElement('p');label.className='muted';label.textContent='Descrição original do criador';
      const description=document.createElement('div');description.className='description';description.textContent=plain(data.description || data.description_html || data.details || 'Este modelo não possui descrição.');
      info.append(title,by,rights);
      if(response.import_available){const importButton=button('Importar no projeto',async()=>{
        importButton.disabled=true;say('Baixando o modelo para abrir no Orca…');
        try{await request('u1_import',{provider:item.provider,model_id:item.id});say('Modelo baixado. Confira o perfil, os materiais e o conteúdo importado na aba Preparar.');}catch(e){say(e.message);}finally{importButton.disabled=false;}
      },'primary');info.append(importButton);}
      else if(item.provider==='thingiverse') {
        const files=await request('u1_files',{provider:item.provider,model_id:item.id});
        if(run!==generation || view!=='detail')return;
        const label=document.createElement('p');label.textContent=files.some(f=>f.extension==='.3mf')?'Projeto 3MF do criador disponível. Será baixado e aberto com sua organização original.':'O criador publicou peças STL. O U1 Lab baixará o conjunto, organizará as peças e salvará um projeto 3MF local. Escolha abaixo o filamento de cada peça. STL não contém cores; uma peça de malha única precisa de pintura na área Preparar. As peças serão organizadas separadamente para montagem.';info.append(label);
        const advanced=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Escolher arquivos (opcional)';advanced.append(summary);info.append(advanced);
        const firstProject=files.find(f=>f.extension==='.3mf');
        const filaments=await request('u1_filaments');
        if(run!==generation || view!=='detail')return;
        advanced.open=!firstProject;
        summary.textContent='Peças e cores dos filamentos';
        const choices=[];
        for(const file of files){
          const row=document.createElement('div');row.style.marginBottom='12px';
          const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=firstProject?file.key===firstProject.key:true;
          label.append(check,document.createTextNode(' '+file.name));row.append(label);
          const filament=document.createElement('select');filament.setAttribute('aria-label','Filamento de '+file.name);
          if(file.extension!=='.3mf'){
            for(const f of filaments){const option=document.createElement('option');option.value=f.id;option.textContent=`Filamento ${f.id} · ${f.color}`;filament.append(option);}
            const swatch=document.createElement('span');swatch.style.cssText='display:inline-block;width:22px;height:22px;border:1px solid #888;border-radius:50%;margin:0 8px;vertical-align:middle';
            const paint=()=>{const color=filaments.find(f=>String(f.id)===filament.value)?.color;swatch.style.backgroundColor=/^#[0-9a-f]{6}$/i.test(color)?color:'transparent';};filament.addEventListener('change',paint);paint();
            row.append(document.createElement('br'),swatch,filament);
          }
          advanced.append(row);choices.push({check,file,filament});
        }
        const open=button('Baixar projeto completo',async()=>{
          const selected=choices.filter(c=>c.check.checked);
          if(!selected.length){say('Selecione pelo menos um arquivo.');return;}
          if(selected.length>1 && selected.some(c=>c.file.extension==='.3mf')){say('Selecione o projeto 3MF sozinho ou apenas as peças STL.');return;}
          open.disabled=true;
          try{
            for(let i=0;i<selected.length;i++){say(`Baixando arquivo ${i+1} de ${selected.length} para a pasta do U1 Lab…`);await request('u1_download_file',{provider:'thingiverse',file:selected[i].file.key});}
            say('Abrindo na área Preparar…');await request('u1_open_downloads',{files:selected.map(c=>c.file.key),filaments:selected.map(c=>Number(c.filament.value)||1)});say('Projeto 3MF salvo na pasta do U1 Lab e aberto em Preparar. Confira cores, materiais e orientação antes de fatiar.');
          }catch(e){say(e.message);}finally{open.disabled=false;}
        },'primary');
        open.disabled=!files.length;info.append(open);
        if(!files.length)label.textContent='Este modelo não oferece arquivos STL ou 3MF para importação direta.';
      }
      else {const note=document.createElement('p');note.className='muted';note.textContent='A importação direta deste modelo ainda não está disponível.';info.append(note);}
      info.append(label,description);grid.append(img,info);$('#detail-body').append(grid);say('');
    }catch(e){if(run===generation)say(e.message);}
  }
  document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{++generation;busy=false;$('#refresh').disabled=false;show(b.dataset.view);if(view==='catalog')search();}));
  $('#back').addEventListener('click',()=>{++generation;busy=false;show(previousView==='favorites'?'favorites':'catalog');if(view==='catalog')search();});
  $('#provider').addEventListener('change',()=>{++generation;busy=false;provider=$('#provider').value;filtered=[];total=0;page=1;filters(false);search();});
  $('#resolve-connection').addEventListener('click',()=>{++generation;busy=false;show('connections');});
  $('#use-snapmaker').addEventListener('click',()=>{++generation;busy=false;provider='snapmaker';$('#provider').value=provider;filters(false);search();});
  $('#search').addEventListener('submit',e=>{e.preventDefault();if(provider==='thingiverse' && $('#query').value.trim()!==lastThingiverseQuery)$('#provider-filters [name=sort]').value=$('#query').value.trim()?'relevant':'newest';search();});
  $('#provider-filters').addEventListener('change',()=>search());
  $('#refresh').addEventListener('click',()=>{catalog=[];catalogComplete=false;search();});
  $('#previous').addEventListener('click',()=>{page--;provider==='snapmaker'?render():search(false);});
  $('#next').addEventListener('click',()=>{page++;provider==='snapmaker'?render():search(false);});
  for(const [id,command] of [['open-project','homepage_openproject'],['new-project','homepage_newproject']])$('#'+id).addEventListener('click',()=>{try{native(command);}catch(e){say(e.message);}});
  function connection(data){connected=data.thingiverse;$('#provider option[value=thingiverse]').textContent=connected?'Thingiverse':'Thingiverse — requer conexão';$('#thingiverse-state').textContent=connected?'Conectado · chave salva':'Conexão necessária';$('#disconnect').disabled=!connected;}
  $('#connect').addEventListener('click',async()=>{try{connection(await request('u1_configure_thingiverse'));}catch(e){say(e.message);}});
  $('#disconnect').addEventListener('click',async()=>{try{connection(await request('u1_disconnect_thingiverse'));}catch(e){say(e.message);}});
  window.addEventListener('message',event=>{
    let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch{return;}
    if(data?.command!=='get_recent_projects')return;
    const list=$('.recent-list');list.replaceChildren();
    for(const item of Array.isArray(data.response)?data.response:[]){const b=button(item.project_name,()=>{try{native('homepage_open_recentfile',{data:{path:item.path}});}catch(e){say(e.message);}});list.append(b);}
    if(!list.children.length)list.textContent='Nenhum projeto recente neste perfil.';
  });
  async function init(){
    filters();
    for(let attempt=0; !window.wx?.postMessage && attempt<50; attempt++) await new Promise(resolve=>setTimeout(resolve,100));
    try{connection(await request('u1_status'));favorites=await request('u1_load_favorites');storageOK=true;}catch(e){say(e.message);}
    await search();
  }
  init();
})();
