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
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('A consulta demorou mais que o esperado. Tente novamente.')); }, ['u1_mw_connect','u1_mw_verify'].includes(command) ? 600000 : ['u1_import','u1_download_file','u1_open_downloads','u1_mw_import'].includes(command) ? 180000 : 35000);
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
  function colorName(hex){
    if(!/^#[0-9a-f]{6}$/i.test(hex))return 'Cor personalizada';
    const palette=[['Branco',255,255,255],['Preto',0,0,0],['Cinza',188,194,200],['Vermelho',193,68,63],['Azul',50,90,190],['Amarelo',245,210,0],['Verde',40,150,70],['Laranja',245,130,30],['Rosa',240,100,160],['Roxo',130,60,160],['Marrom',115,70,35]];
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    return palette.reduce((best,p)=>{const d=rgb.reduce((n,v,i)=>n+(v-p[i+1])**2,0);return d<best.d?{d,name:p[0]}:best;},{d:Infinity}).name;
  }
  function partLabel(name){
    const known={'shaft_x_2.stl':'Pino de montagem (2 unidades)','right_eye.stl':'Olho direito','left_eye.stl':'Olho esquerdo','external_eye.stl':'Parte externa dos olhos','stand.stl':'Base de apoio','mouth.stl':'Interior da boca','front_body.stl':'Frente do corpo','tongue.stl':'Língua','back_body.stl':'Parte de trás do corpo','teeth.stl':'Dentes'};
    if(known[name.toLowerCase()])return known[name.toLowerCase()];
    const words={shaft:'Pino',right:'direito',left:'esquerdo',eye:'olho',external:'externo',stand:'Base',mouth:'Boca',front:'frente',body:'corpo',tongue:'Língua',back:'traseira',teeth:'Dentes'};
    return name.replace(/\.(stl|3mf)$/i,'').split(/[_ -]+/).map(w=>words[w.toLowerCase()]||w).join(' ');
  }
  function referenceHint(modelId,name){
    if(String(modelId)!=='2824758')return 'Cor original não informada. Compare a miniatura com a referência do criador.';
    const hints={
      'front_body.stl':'Sugestão pela foto: branco — parte da frente do corpo.',
      'back_body.stl':'Sugestão pela foto: branco — parte de trás do corpo.',
      'teeth.stl':'Sugestão pela foto: branco — dentes.',
      'tongue.stl':'Sugestão pela foto: vermelho. O criador também sugere rosa para a língua.',
      'mouth.stl':'O criador menciona vermelho-escuro para o interior da boca.',
      'right_eye.stl':'Região do olho direito: preto e branco na foto. Compare o formato da miniatura antes de escolher.',
      'left_eye.stl':'Região do olho esquerdo: preto e branco na foto. Compare o formato da miniatura antes de escolher.',
      'external_eye.stl':'Componente dos olhos: compare a miniatura com as áreas pretas e brancas da foto.',
      'shaft_x_2.stl':'Pino de montagem: cor livre. O nome do criador indica 2 unidades; confira a quantidade em Preparar.',
      'stand.stl':'Base de apoio: escolha a cor que preferir.'
    };return hints[name]||'Cor original não informada.';
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
    if(provider==='makerworld'){show('connections');$('#mw-url').focus();say('MakerWorld: importe pelo link do projeto abaixo.');return;}
    if(provider==='printables'){filtered=[];total=0;render();say('Integração ainda indisponível. Nenhuma busca foi enviada. Veja a seção Integrações.');return;}
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
        const help=document.createElement('p');help.className='muted';help.textContent='As opções mostram as cores cadastradas no seu perfil. Se faltar branco, preto ou outra cor, ajuste os filamentos em Preparar → Gerenciamento de filamentos. A miniatura identifica a peça; sua cor de renderização não indica o filamento original.';advanced.append(help);
        const choices=[];
        for(const file of files){
          const row=document.createElement('div');row.className='part-card';
          const preview=document.createElement('img');preview.referrerPolicy='no-referrer';preview.alt='Prévia de '+partLabel(file.name);preview.loading='lazy';
          const thumbnail=imageURL(file.thumbnail);if(thumbnail){preview.src=thumbnail;row.append(preview);}
          const content=document.createElement('div');row.append(content);
          const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=firstProject?file.key===firstProject.key:true;
          label.append(check,document.createTextNode(' '+partLabel(file.name)));content.append(label);
          const original=document.createElement('small');original.textContent=file.name;content.append(original);
          const hint=document.createElement('p');hint.className='muted';hint.textContent=referenceHint(item.id,file.name);if(file.extension!=='.3mf')content.append(hint);
          const filament=document.createElement('select');filament.setAttribute('aria-label','Filamento de '+file.name);
          if(file.extension!=='.3mf'){
            const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Escolha a cor desta peça';filament.append(placeholder);
            for(const f of filaments){const option=document.createElement('option');option.value=f.id;option.textContent=`${colorName(f.color)} · Filamento ${f.id}`;filament.append(option);}
            const swatch=document.createElement('span');swatch.style.cssText='display:inline-block;width:22px;height:22px;border:1px solid #888;border-radius:50%;margin:0 8px;vertical-align:middle';
            const paint=()=>{const color=filaments.find(f=>String(f.id)===filament.value)?.color;swatch.style.backgroundColor=/^#[0-9a-f]{6}$/i.test(color)?color:'transparent';};filament.addEventListener('change',paint);paint();
            content.append(swatch,filament);
          }
          advanced.append(row);choices.push({check,file,filament});
        }
        const open=button('Baixar projeto completo',async()=>{
          const selected=choices.filter(c=>c.check.checked);
          if(!selected.length){say('Selecione pelo menos um arquivo.');return;}
          if(selected.length>1 && selected.some(c=>c.file.extension==='.3mf')){say('Selecione o projeto 3MF sozinho ou apenas as peças STL.');return;}
          if(selected.some(c=>c.file.extension!=='.3mf'&&!c.filament.value)){say('Escolha o filamento de cada peça selecionada. As miniaturas e indicações ao lado ajudam a identificar cada parte.');return;}
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
  function mwConnection(data){
    if(data.cancelled)return;
    $('#mw-state').textContent=data.connected?'Conectado · sessão salva':data.verification?'Informe o código':'Conexão necessária para baixar';
    $('#mw-verify').hidden=!data.verification;$('#mw-disconnect').disabled=!data.connected;
  }
  async function mwAction(command){
    const buttons=[$('#mw-connect'),$('#mw-verify'),$('#mw-disconnect')];buttons.forEach(b=>b.disabled=true);
    try{mwConnection(await request(command));$('#mw-status').textContent='';}
    catch(e){$('#mw-status').textContent=e.message;}
    finally{buttons.forEach(b=>b.disabled=false);}
  }
  $('#mw-connect').addEventListener('click',()=>mwAction('u1_mw_connect'));
  $('#mw-verify').addEventListener('click',()=>mwAction('u1_mw_verify'));
  $('#mw-disconnect').addEventListener('click',()=>mwAction('u1_mw_disconnect'));
  $('#mw-form').addEventListener('submit',async e=>{
    e.preventDefault();const submit=$('#mw-form button');submit.disabled=true;$('#mw-model').replaceChildren();$('#mw-status').textContent='Consultando perfis e placas…';
    try{
      const data=await request('u1_mw_resolve',{url:$('#mw-url').value.trim()});
      const container=$('#mw-model'),title=document.createElement('h3');title.textContent=data.title;container.append(title);
      const credit=document.createElement('p');credit.textContent=`${data.creator||'Criador'} · ${data.license||'Licença não informada'}`;container.append(credit);
      const cover=imageURL(data.cover);if(cover){const img=document.createElement('img');img.src=cover;img.referrerPolicy='no-referrer';img.alt=data.title;img.style.cssText='max-width:300px;width:100%;border-radius:12px';container.append(img);}
      const description=document.createElement('p');description.textContent=plain(data.summary);container.append(description);
      for(const profile of data.profiles){
        const card=document.createElement('div');card.className='connection';const heading=document.createElement('h4');heading.textContent=profile.title||'Perfil do criador';card.append(heading);
        for(const plate of profile.plates||[]){
          const row=document.createElement('p');row.textContent=`Placa ${plate.index}: `;
          for(const filament of plate.filaments||[]){const color=document.createElement('span');color.textContent=` ${colorName(filament.color)} (${filament.type||'material não informado'}) `;color.style.cssText='display:inline-block;margin:4px;padding:4px 8px;border:1px solid #b8c6bc;border-radius:8px';if(/^#[0-9a-f]{6}$/i.test(filament.color))color.style.borderLeft='12px solid '+filament.color;row.append(color);}
          card.append(row);
          if((plate.filaments||[]).length>4){const warning=document.createElement('p');warning.textContent='Esta placa usa mais de quatro filamentos. Será necessário revisar a distribuição para sua U1.';card.append(warning);}
        }
        const open=button('Baixar projeto com cores',async()=>{
          open.disabled=true;$('#mw-status').textContent='Baixando o projeto 3MF completo…';
          try{await request('u1_mw_import',{profile:String(profile.id)});$('#mw-status').textContent='Projeto baixado e enviado para abertura. Confira a importação, selecione sua Snapmaker U1 e revise materiais e pintura antes de fatiar.';}catch(e){$('#mw-status').textContent=e.message;}finally{open.disabled=false;}
        },'primary');card.append(open);container.append(card);
      }
      $('#mw-status').textContent=data.profiles.length?'Escolha um perfil. As cores acima são as informações publicadas no projeto.':'Este modelo não disponibilizou perfis 3MF para importar.';
    }catch(e){$('#mw-status').textContent=e.message;}finally{submit.disabled=false;}
  });
  request('u1_mw_status').then(mwConnection).catch(e=>{$('#mw-status').textContent=e.message;});
  function connection(data){connected=data.thingiverse;$('#provider option[value=thingiverse]').textContent=connected?'Thingiverse':'Thingiverse — requer conexão';$('#thingiverse-state').textContent=connected?'Conectado · chave salva':data.recovery_required?'Chave antiga bloqueada · reconecte uma vez':'Conexão necessária';$('#disconnect').disabled=!connected;}
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
