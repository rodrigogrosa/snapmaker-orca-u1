# Snapmaker Orca U1

## Objetivo

Evoluir o Snapmaker Orca para facilitar a descoberta, organização e importação de modelos para a Snapmaker U1. O repositório pertence a Rodrigo Rosa; o desenvolvimento é assistido pelo Codex.

## Origem e estado inicial

- Repositório: https://github.com/rodrigogrosa/snapmaker-orca-u1
- Projeto de origem: https://github.com/Snapmaker/OrcaSlicer
- Base inicial: `56e82d53c85457f530827d2488664015b2eae08e` (`main`).
- Licença: AGPL-3.0, conforme `LICENSE.txt`; preservar atribuições e avisos existentes.
- Código original copiado com histórico Git. A primeira evolução da biblioteca está descrita em `U1-LAB.md`.
- Ferramentas locais preparadas; dependências nativas compiladas com Ninja e CMake 3.31.10. Prévia de interface com runtime 2.3.6 validada no Mac. A compilação do programa principal é uma verificação separada, registrada em `U1-LAB.md` quando concluída.

## Primeira evolução

1. Preparar as dependências e compilar a base original no Mac. Executar o aplicativo com dados de desenvolvimento separados dos perfis pessoais.
2. Identificar a implementação da página inicial e da importação; adicionar acesso a sites de modelos sem depender de APIs ainda não verificadas.
3. Implementar biblioteca local de arquivos STL/3MF com miniaturas, favoritos e categorias.
4. Facilitar a importação com conferência do perfil U1, materiais e atribuição aos quatro cabeçotes. Não prometer conversão universal de projetos 3MF.
5. Avaliar integrações específicas conforme APIs e condições de cada serviço.

Preservar inicialmente o motor de fatiamento. Cada etapa deve produzir uma alteração revisável, com verificação proporcional ao impacto. Mudanças em fatiamento ou envio para a impressora exigem validação adicional antes do uso físico.

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
