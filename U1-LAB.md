# U1 Lab — biblioteca integrada e português brasileiro

A página inicial agora é a biblioteca. Não há painel flutuante nem abertura de sites externos neste fluxo. O motor e os perfis de impressão continuam sendo os da base Snapmaker Orca; o pacote de desenvolvimento usa dados separados do aplicativo oficial.

## Como testar

1. Abra **U1 Lab Native.app**. A região do perfil de laboratório é **Brasil** e o idioma é **Português (Brasil)**.
2. Na biblioteca, busque por nome de modelo ou criador. O catálogo Snapmaker é carregado em páginas e permite filtrar por criador, tipo de arquivo e ordenação. A busca é local sobre os modelos carregados, não uma API de busca remota da Snapmaker.
3. Clique no coração para salvar um modelo. Os favoritos ficam em `model-library/favorites.json` dentro do perfil, independentes da porta local.
4. Abra um modelo para ver sua descrição e licença. **Importar no projeto** baixa STL/3MF disponível e aciona a abertura normal do Orca. O limite de download é 100 MiB. O aplicativo pode pedir que você revise configurações trazidas pelo projeto.
5. Para Thingiverse, abra **Integrações → Conectar Thingiverse** e informe a credencial do seu próprio aplicativo registrado. A credencial é salva no cofre de credenciais do sistema e restaurada ao abrir o aplicativo, inclusive após atualizações. Desconectar remove a chave salva. Não coloque credenciais no Git ou em mensagens.

## Disponibilidade dos serviços

| Serviço | Estado | Filtros e limites |
| --- | --- | --- |
| Snapmaker | Catálogo, detalhes e importação testados com serviço real | 115 modelos na verificação; consulta local por nome/criador, criador, somente G-code ou modelo, ordem por nome/data. A API observada fornece paginação, sem outros filtros remotos verificados. |
| Thingiverse | Conector implementado; teste autenticado pendente de credencial | Busca, página, tamanho da página e os 18 campos opcionais documentados: ordenação, datas, educação, disciplinas, séries, normas, licença, personalização, impressões, destaque, desafio, usuários e categoria. Filtro de desafio experimental: a documentação publica um nome aparentemente incorreto. Detalhes internos; importação ainda não implementada. |
| Printables | Acesso pendente | A consulta automatizada foi bloqueada. Não contorna bloqueios nem apresenta resultados fictícios. |
| MakerWorld | Acesso pendente | API pública utilizável por este aplicativo ainda não verificada. |

Referências: [API oficial do Thingiverse](https://www.thingiverse.com/developers/swagger), [campos da busca](https://www.thingiverse.com/swagger/docs/resources/search.yaml), [termos da API](https://www.thingiverse.com/legal/api). As rotas Snapmaker foram verificadas no aplicativo de origem e no serviço real. Não são apresentadas como uma API pública com garantia de estabilidade.

## Tradução e região

- Catálogo nativo pt_BR: 4.790 mensagens preenchidas, incluindo 340 ausentes no catálogo antigo. A extração pela lista de fontes atual resulta em 4.699 mensagens sem traduções pendentes.
- Parte Flutter: 1.645 valores em português brasileiro, incluindo chaves usadas pelo programa que faltavam no catálogo original. Todos os nomes de campos e marcadores de substituição são verificados.
- O programa Flutter distribuído pela origem registra somente inglês e chinês. O carregador `locale-pt-br.js` direciona o recurso inglês para pt-BR somente quando a localidade solicitada é portuguesa. Outros idiomas preservam o comportamento original.
- O servidor local mantém o conjunto de recursos web deste fork junto com sua tradução; o cache de uma versão upstream não substitui esse conjunto. Atualizações dessa interface devem ser feitas pelo Git e pela recompilação/empacotamento.
- Brasil usa código BR e o serviço internacional existente, sem criar um servidor brasileiro fictício. Autenticação em nuvem na região Brasil ainda requer validação com uma conta.
- Títulos, descrições e licenças dos criadores são apresentados no idioma original. Imagens com texto, textos fornecidos pelo firmware e diálogos do sistema operacional não são cobertos por uma contagem do catálogo. Não se declara revisão visual de todas as telas ou tradução universal de conteúdo remoto.

## Compilar e empacotar

```sh
./scripts/build_u1_macos.sh --all
python3 scripts/package_u1_lab.py --source 'build/arm64/Snapmaker_Orca/Snapmaker Orca.app' --output '/caminho/novo/U1 Lab Native.app' --profile '/caminho/perfil-laboratorio' --source-build
```

Feche a cópia de laboratório antes de empacotar. O destino deve ser novo, e um perfil existente precisa conter o marcador `.u1-lab-profile`. O empacotador configura apenas esse perfil para pt_BR/Brasil, guardando uma cópia da configuração anterior se necessário. O pacote contém a revisão Git e a procedência do executável em `U1-LAB.json`. Requer gettext (`msgfmt`).

A compilação local foi feita para macOS arm64 com CMake 3.31.10, Ninja e Command Line Tools. O aplicativo informa versão 2.4.0, pois usa a branch de desenvolvimento da origem. A assinatura é local, sem notarização. O aviso de ligação com zstd de um macOS mais recente permanece; portabilidade para outros Macs não foi validada.

## Verificação

Com os recursos servidos localmente e Node, Playwright, Chrome e gettext disponíveis:

```sh
python3 -m http.server 18791 --bind 127.0.0.1 --directory resources
node tests/web/model-library.cjs
node tests/web/locale-loader.cjs
python3 tests/web/localization.py
U1_HTTP_PORT=13620 python3 tests/web/http-framing.py
```

Use a porta efetiva exibida pelo aplicativo no último comando. Os testes da biblioteca usam dados sintéticos identificados como fixtures; cobrem paginação, filtros, persistência, conteúdo não executável, roteamento de importação/arquivos recentes, os filtros Thingiverse e ausência de janelas externas. O teste de idioma verifica as chaves, marcadores, catálogo nativo atualizado e o carregador de idioma por fetch/XHR.

Verificação nativa com serviço real: carregamento de 115 modelos, busca por `trophy`, favorito persistente, detalhes internos e download/abertura do arquivo Snapmaker 119 (3MF, aproximadamente 2,7 MiB). Nenhuma impressão ou comando de movimento foi enviado à impressora. A leitura de cabeçalhos HTTP fragmentados mantém a correção CRLF previamente validada.

## Implementação

- `resources/web/model-library/`: página principal e controles dos catálogos.
- `src/slic3r/GUI/ModelLibrary.cpp`: requisições com destinos e campos permitidos, credencial temporária, favoritos e abertura do arquivo baixado.
- `WebViewPanel::HandleLibraryMessage`: aceita os novos comandos somente na página local da biblioteca.
- Conteúdo remoto entra como texto ou imagem. HTML remoto não é inserido na interface e não recebe acesso à ponte nativa. Credenciais de conta do Orca não são encaminhadas aos catálogos.

### Correção da busca

Plataformas desconectadas mostram “Busca indisponível”, sem apresentar zero resultados como se a consulta tivesse ocorrido. A biblioteca oferece atalhos para a conexão e para o catálogo Snapmaker, preservando o texto pesquisado. Pesquisar durante o carregamento não interrompe mais a paginação; os filtros são preservados ao concluir a carga. A correspondência local ignora acentos e aceita palavras em outra ordem, mas não traduz os termos digitados. O acesso ao Thingiverse continua exigindo a credencial de um aplicativo registrado na plataforma.

### Relevância da busca

Ao trocar de plataforma, a ordenação passa a usar o padrão do catálogo de destino: Thingiverse começa em Relevância, sem herdar Mais recentes do Snapmaker. Nesse modo, títulos contendo todas as palavras da consulta (palavras inteiras, sem diferenciar acentos/maiúsculas) têm prioridade dentro de cada página retornada. A ordem relativa da API é preservada em cada grupo e os demais modos mantêm a ordem da plataforma. Isso não traduz consultas nem altera a contagem ou seleciona resultados de páginas ainda não consultadas. A API documentada do Thingiverse não oferece filtro por cor ou número de cores de impressão.


### Persistência das credenciais

O serviço do cofre `com.rodrigogrosa.u1lab.thingiverse` é fixo, independente da versão, pasta do aplicativo e perfil de laboratório. No macOS, wxSecretStore usa o Acesso às Chaves. O empacotamento não remove nem sobrescreve esse item. O sistema pode solicitar autorização de acesso após trocar o executável de uma versão local assinada ad hoc; isso não significa que a chave foi apagada. Falha ao salvar é exibida e não é anunciada como conexão salva. A versão anterior não persistia a chave: é necessário inseri-la uma vez nesta versão.

Validação: compilação nativa macOS, testes da biblioteca e teste `tests/model-library/secret-store.cpp` usando um valor sintético e serviço separado, com gravação/leitura em processos distintos e remoção confirmada. Nenhuma credencial real entra em testes, arquivos do projeto ou logs.

### Catálogo inicial e páginas de 100 modelos

O Thingiverse abre com `sort=newest` quando não há texto, usando o endpoint `/search/` documentado para navegação geral. Popularidade continua disponível; ela não representa uma contagem verificada de downloads. O padrão de paginação é 100 tanto para navegação quanto para pesquisa, com opções de 50 e 20. Uma nova consulta textual começa por relevância e volta à primeira página. O último lote pode conter menos de 100 resultados. Testes da interface verificam carga inicial de 100, segunda página parcial e pesquisa com o mesmo tamanho.

### Download do Thingiverse e abertura no Orca

Os detalhes listam arquivos STL/3MF da API oficial e oferecem **Baixar e abrir no projeto**. O usuário seleciona as peças desejadas, evitando misturar versões alternativas ou um projeto 3MF com outras peças. O download aceita URLs HTTPS do CDN e o endpoint v2 de download do arquivo, validados contra o identificador devolvido pela API. A autenticação é aplicada somente às requisições iniciadas no domínio da API; libcurl não encaminha Authorization a outro host nos redirecionamentos. Os arquivos ficam em `model-library` dentro do perfil exclusivo do U1 Lab, com nomes formados pelos identificadores do modelo e arquivo. Após baixar a seleção, o Orca abre os modelos na área Preparar, preservando a configuração atual da impressora. Para vários STL, o diálogo do Orca permite definir como agrupá-los. Não inicia impressão física.

Arquivos fora dos formatos suportados não são oferecidos. Cada download tem limite de 100 MiB e 120 segundos. Os testes da biblioteca cobrem seleção de duas peças, download sequencial e abertura somente após concluir os downloads.

Validação real adicional: o Boo (2824758) lista dez peças STL no endpoint v2; o download da peça shaft retornou HTTP 200 com conteúdo STL.

### Projeto completo como ação principal

**Baixar projeto completo** seleciona por padrão um 3MF do criador, quando disponível; caso contrário, baixa todas as peças STL. A seleção manual fica em “Escolher arquivos (opcional)” para variantes do catálogo. A abertura cria um novo projeto com a confirmação nativa de salvamento do trabalho anterior. Para STL, usa a organização automática do Orca e salva o resultado em `model-library/projects/thingiverse-<identificador único>.3mf`. Projetos anteriores não são sobrescritos. Para um 3MF publicado, carrega também sua configuração e preserva o posicionamento.

Esse processo não inventa cores, material, quantidades extras ou parâmetros ausentes no catálogo. Um conjunto STL convertido em 3MF ainda precisa da revisão de orientação e configuração de impressão. Os testes verificam a seleção automática do conjunto completo e o fluxo de abertura.

### Peças e filamentos na importação

A importação de STL agora mantém o nome original de cada arquivo, permite selecionar um filamento do perfil por arquivo e remove a seleção parcial antes de organizar todo o conjunto. Cada arquivo é carregado separadamente; os filamentos são gravados no projeto 3MF local. Projetos 3MF fornecidos pelo criador continuam usando a configuração e a disposição originais, sem aplicar as escolhas de STL. Uma malha STL única não possui pintura: esse caso ainda exige pintura na área Preparar. As cores oferecidas correspondem ao perfil, não à detecção dos carretéis físicos.

Validação: teste da biblioteca verifica dois arquivos com filamentos distintos na solicitação nativa; compilação macOS arm64. Não houve impressão física.

### Identificação visual das peças

A lista de arquivos usa as miniaturas disponibilizadas pelo Thingiverse, com nomes legíveis em português para componentes conhecidos e nomes de cores em vez de códigos hexadecimais. STL começa sem filamento selecionado, exigindo uma escolha explícita para evitar que tudo seja importado silenciosamente com o primeiro filamento. O Boo 2824758 recebe orientações pontuais baseadas na foto fornecida e na descrição do criador; são sugestões, não cores extraídas do STL nem um serviço de reconhecimento automático. Partes ambíguas são identificadas como tal. O perfil precisa conter os filamentos desejados.

Testes cobrem miniatura carregada sem Referer e bloqueio do download enquanto houver peças selecionadas sem filamento; os nomes desconhecidos são preservados. Sem impressão física.
