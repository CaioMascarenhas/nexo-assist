# Correções da auditoria de conversas — 30/10/2026

A análise do relato em `la.txt` resultou nas correções abaixo. O encaminhamento direto N1 → N2 permanece adiado conforme solicitado.

> A regra inicial de associação por termos descrita neste registro foi evoluída para a [verificação semântica pelo agente](15-duplicidade-semantica.md). As demais correções continuam vigentes.

> O encaminhamento N1 → N2, adiado nesta rodada histórica, foi implementado posteriormente em [Encaminhamento entre analistas](16-encaminhamento-entre-analistas.md).

## Integridade do protocolo

A comparação por similaridade textual permitia misturar pedidos de instalação de programas diferentes. A associação automática agora exige a mesma categoria e igualdade dos termos significativos do título, desconsiderando apenas palavras de ligação e expressões genéricas do pedido. Nomes curtos, números e versões participam da identificação. Se houver vários alvos na mesma situação, nenhum é escolhido automaticamente. Um chamado aberto tem preferência sobre uma correspondência já resolvida dentro da janela de reabertura.

O título mostrado em rascunhos de complemento/reabertura é o título real do protocolo. A regra também vale para a verificação de duplicidade durante a confirmação. A estratégia conservadora pode gerar novos protocolos para títulos diferentes que descrevam o mesmo problema; o funcionário pode selecionar o protocolo existente pela consulta para complementá-lo explicitamente.

## Descrição após esclarecimentos

A descrição passa a reunir os fatos estruturados atuais e os relatos originais, com indicação de relato inicial e esclarecimentos posteriores. Não depende da reescrita de uma descrição antiga pelo modelo. Dúvidas anteriores ficam identificadas como histórico, e os esclarecimentos mais recentes prevalecem. A descrição revisada é a mesma persistida após a confirmação.

O teste da Zebra cobre alcance inicialmente desconhecido, posterior confirmação individual e alternativa na recepção, mesmo quando o modelo não envia uma nova descrição. O limite de 6.000 caracteres preserva os fatos atuais e o trecho mais recente dos relatos.

## Continuidade da responsabilidade

Encerrar um atendimento com protocolo vinculado ainda aberto retorna 409 e preserva estado, responsável e presença em **Minhas**. A interface desabilita o encerramento e explica que o chamado precisa ser resolvido primeiro. Falha na consulta do legado também preserva o atendimento. Após a resolução, o encerramento separado da conversa continua disponível; conversas sem protocolo vinculado também podem ser encerradas.

Esta proteção não acrescenta encaminhamento entre analistas nem altera as ações de assunção e devolução ao assistente.

## Solução e histórico visíveis

Os cartões e o painel lateral compartilham a apresentação do prazo e do histórico. A solução do ciclo atual aparece com texto, autor e data; o histórico permite consultar complementos, encaminhamentos, reaberturas e soluções anteriores. Depois de reabrir, uma solução do ciclo anterior não aparece como solução atual. Chamados resolvidos ou encerrados deixam de exibir o prazo futuro de resposta.

## Validação

- Testes PostgreSQL em schemas temporários, incluindo programas diferentes, nomes semelhantes, versões, nomes curtos, preservação do histórico original e responsabilidade após tentativa de encerramento.
- Testes do agente, verificação de tipos, lint e formatação.
- Build de produção e 25 jornadas Playwright em Docker isolado, modo stub, sem chamadas pagas ao modelo.
- Conferência visual do painel resolvido em desktop e celular de 390 px, incluindo solução, autor, data e ausência de rolagem horizontal.

Os registros históricos da auditoria e o arquivo `la.txt` foram preservados. As correções não separam automaticamente históricos já misturados nem reatribuem atendimentos encerrados antes da alteração.
