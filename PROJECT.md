# Snapmaker Orca U1

## Objetivo

Evoluir o Snapmaker Orca para facilitar a descoberta, organização e importação de modelos para a Snapmaker U1. O repositório pertence a Rodrigo Rosa; o desenvolvimento é assistido pelo Codex.

## Origem e estado inicial

- Repositório: https://github.com/rodrigogrosa/snapmaker-orca-u1
- Projeto de origem: https://github.com/Snapmaker/OrcaSlicer
- Base inicial: `56e82d53c85457f530827d2488664015b2eae08e` (`main`).
- Licença: AGPL-3.0, conforme `LICENSE.txt`; preservar atribuições e avisos existentes.
- Código original copiado com histórico Git. A primeira evolução da biblioteca está descrita em `U1-LAB.md`.
- Ferramentas locais preparadas; dependências nativas compiladas com Ninja e CMake 3.31.10. Prévia de interface com runtime 2.3.6 validada no Mac. O programa principal também foi compilado e validado na abertura da biblioteca e leitura de STL, após corrigir a leitura HTTP de requisições fragmentadas. Resultados e limites em `U1-LAB.md`.

## Biblioteca e próximos passos

A página inicial apresenta os resultados diretamente. Snapmaker tem catálogo, filtros locais, detalhes, favoritos persistentes e importação. Thingiverse tem conector da API oficial com filtros, dependente da credencial do aplicativo do usuário. Printables permanece indisponível. MakerWorld aparece na biblioteca com busca por palavras, 100 resultados por página, ordenação, filtros de multicolorido/bico/licença, favoritos, detalhes e importação de perfis 3MF. Usa o endpoint design2 observado no site e autenticação Bambu global persistente. Busca real validada com duas páginas de 100 resultados sem repetição; download autenticado confirmado no aplicativo: 3MF completo com configurações e três cores preservadas no arquivo (azul, branco e bege). O importador nativo solicita revisão de predefinições Bambu; selecionar U1 antes de fatiar. Não abrir páginas externas como substituto de integração.

O perfil de laboratório usa Brasil e português brasileiro. Os catálogos nativo e web foram completados e têm testes de cobertura; conteúdo de criadores, firmware e diálogos do sistema requerem avaliação separada. Ver detalhes em `U1-LAB.md`.

Próximas validações: busca autenticada e download no Thingiverse; acesso às outras plataformas; conta em nuvem na região Brasil; revisão visual de telas menos usadas. Não prometer compatibilidade universal de projetos 3MF ou impressão física sem verificação.

## Desenvolvimento local e Git

- `origin` aponta para o fork de Rodrigo; `upstream` aponta para a Snapmaker.
- `main` é a base compartilhada. Criar branches curtas por funcionalidade ou correção.
- Implementar e verificar localmente antes de integrar; fazer commits pequenos que expliquem o resultado.
- Enviar commits ao `origin` ao concluir cada entrega. Não enviar alterações ao `upstream` sem solicitação.
- Atualizações da Snapmaker devem ser buscadas e revisadas em branch própria antes da integração.
- Não versionar credenciais, dados pessoais, arquivos privados de modelos nem artefatos de compilação.
- Não reescrever histórico compartilhado nem usar push forçado como rotina.

Exemplo de início de uma funcionalidade:

```sh
git switch main
git pull --ff-only origin main
git switch -c feature/model-library
```

Após implementar e verificar, adicionar explicitamente os arquivos alterados, criar o commit e publicar a branch:

```sh
git push -u origin HEAD
```

## Compilação

Consultar as instruções originais no `README.md` e as opções de `build_release_macos.sh`. O script usa Xcode por padrão e oferece a alternativa Ninja com `-x`; preparar a cadeia escolhida antes de executar. A existência do código local não significa que o aplicativo já foi compilado ou testado neste Mac.
