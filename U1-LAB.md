# U1 Lab: primeira biblioteca de modelos

## O que testar

Na página inicial do aplicativo, clique em **Explorar modelos**, no canto inferior direito.

1. Digite um termo ou escolha uma sugestão e clique na comunidade desejada.
2. O site abre no navegador padrão. A biblioteca não copia catálogos nem baixa arquivos automaticamente.
3. Use **Salvar um link** para guardar nome e endereço HTTPS de um modelo. Os links podem ser abertos e removidos.
4. Baixe o STL/3MF pelo site e volte ao Orca para importar, configurar a U1 e conferir a prévia.

Os favoritos são links, não arquivos 3D. Eles ficam no armazenamento local da visualização web. Na versão inicial, ficam associados à origem local (incluindo a porta); se a porta mudar por haver outras instâncias abertas, a lista pode aparecer diferente. A próxima evolução deve migrar esses dados para um arquivo da biblioteca no perfil do aplicativo.

## Dois caminhos de teste

### Prévia de interface com o aplicativo já instalado

O pacote de prévia copia o aplicativo indicado, acrescenta apenas os recursos da biblioteca e cria uma identidade de teste. O programa instalado é lido, não alterado. Este caminho **não compila o motor C++ do fork**.

```sh
python3 scripts/package_u1_lab.py \
  --source '/Applications/Snapmaker Orca.app' \
  --output '/caminho/novo/U1 Lab.app' \
  --profile '/caminho/novo/perfil-u1-lab'
```

O destino deve ser novo. Perfis existentes só são aceitos quando possuem o marcador `.u1-lab-profile` criado pelo próprio script. O pacote usa `--datadir`, tem um identificador próprio e não registra as associações de arquivos e URLs do aplicativo oficial. Não contém credenciais ou perfis copiados do usuário. A assinatura é local, não uma distribuição notarizada pela Apple.

### Compilação local completa

Com as Command Line Tools do macOS instaladas:

```sh
brew install ninja automake autoconf libtool texinfo gettext
scripts/build_u1_macos.sh --deps
scripts/build_u1_macos.sh --app
```

O helper isola o CMake 3.31.10 em `build/u1-tools`, usa Ninja e a arquitetura do Mac. Para reduzir carga, defina `CMAKE_BUILD_PARALLEL_LEVEL=2`. Os resultados ficam em `build/` e as dependências em `deps/build/`, fora do Git. Consulte a saída final do script de origem para localizar o pacote gerado. Use `--source-build` ao empacotar um bundle efetivamente compilado deste fork.

## Verificação da biblioteca

Sirva os recursos localmente:

```sh
python3 -m http.server 18791 --bind 127.0.0.1 --directory resources
```

Com Node, Playwright e Google Chrome disponíveis:

```sh
node tests/web/model-library.cjs
```

O teste usa um contexto temporário do navegador, sem a sessão pessoal. Cobre busca com caracteres especiais, mensagens para a ponte nativa, links salvos e persistência, remoção, duplicados, validação HTTPS, texto sem execução de HTML, Escape, layout estreito, armazenamento corrompido e abertura externa no navegador. A URL pode ser alterada com `U1_TEST_URL`.

Validação manual já realizada no pacote com runtime 2.3.6: biblioteca aberta no aplicativo, pesquisa da U1 enviada ao Printables no navegador e favorito preservado após encerrar/reabrir a cópia. Nenhum comando foi enviado à impressora. Isso não equivale a validar uma impressão física ou o novo motor compilado.

## Organização da implementação

- `resources/web/model-library/`: HTML de prévia, CSS e JavaScript compartilhados com a integração.
- `resources/web/flutter_web/index.html`: carregamento da biblioteca apenas na página inicial (`path=0`).
- `scripts/package_u1_lab.py`: criação da cópia de teste com perfil separado.
- `scripts/build_u1_macos.sh`: compilação nativa local.
- `tests/web/model-library.cjs`: verificação dos fluxos da biblioteca.

O componente usa Shadow DOM para separar seus estilos da interface Flutter. Os resultados de busca são abertos no navegador por meio do comando existente `common_openurl`. O código não altera o fatiamento nem o envio à impressora.

## Resultado da compilação completa — 2026-09-13

- Dependências e aplicativo compilados localmente para arm64, com Command Line Tools, Ninja e CMake 3.31.10. O runtime informa versão 2.4.0; a base é a branch de desenvolvimento upstream, não uma release estável própria.
- `U1 Lab Native.app` usa uma identidade distinta da prévia 2.3.6 e um perfil de teste separado.
- Corrigido um travamento do servidor HTTP local: a leitura esperava apenas CR, podendo deixar LF isolado quando os pacotes se dividiam. A linha que encerra os cabeçalhos deixava de ser reconhecida e o WebView permanecia em branco. Agora o leitor espera CRLF completo nas duas etapas.
- O teste de regressão reproduziu timeout antes da correção e passou depois: requisição inteira e quatro pontos de divisão CR/LF. Com o aplicativo aberto, executar `U1_HTTP_PORT=<porta-local-do-app> python3 tests/web/http-framing.py`.
- A compilação corrigida abriu a página inicial e a biblioteca; uma pesquisa da U1 abriu o Printables no navegador.
- Leitura de STL via `--info` concluída com código 0: cubo de 20 × 20 × 20 mm, 12 faces, malha fechada, volume aproximado de 8.000 mm³. O programa também registrou a mensagem de exclusão de mesa sem perfil nesse teste; isso não valida configuração de impressão.
- Não foi realizada impressão física. Confirmar o diâmetro do bico e os filamentos no perfil antes de fatiar projetos reais; a configuração inicial upstream pode selecionar bico de 0,2 mm.
- Este é um pacote local. A compilação encontrou o zstd do Homebrew deste Mac; portabilidade para outros Macs e notarização não foram validadas.
