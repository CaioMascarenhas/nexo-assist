# Verificação de duplicidade pelo agente

A triagem agora inclui a análise semântica de duplicidade na chamada que o agente já realiza. Não há uma segunda chamada específica ao modelo antes de montar ou confirmar cada rascunho. A API continua responsável por autorização, elegibilidade, concorrência e gravação após confirmação.

## Candidatos e decisão

Antes da geração, a API envia até 30 candidatos do próprio funcionário: chamados abertos e chamados resolvidos ainda elegíveis para reabertura. Cada candidato inclui protocolo, título, descrição limitada a 2.000 caracteres, categoria, tipo, estado e versão. Após a extração dos fatos, somente candidatos da mesma categoria e tipo INC/REQ podem ser associados.

Para cada candidato pertinente, o agente retorna `same`, `different` ou `uncertain`, com ID e motivo curto. A comparação considera programa/sistema, equipamento, sintoma e objetivo. A instrução distingue explicitamente QGIS de FluxogramaQA e alerta que títulos iguais podem tratar de recursos diferentes.

Uma recomendação `same` precisa de duas evidências de aspectos distintos, com trechos do relato e do candidato. Uma delas identifica o sistema ou equipamento. A API verifica a presença dos trechos nas fontes, a coincidência da identidade citada e que a mesma evidência não foi simplesmente repetida sob rótulos diferentes. Esses controles verificam a origem das evidências; não tornam o julgamento do modelo infalível.

## Dúvida e confirmação

Uma entrada ausente, decisão incerta, alvo fora do contexto autorizado, evidência inválida, vários candidatos classificados como o mesmo assunto ou mudança de versão impede a associação automática. O assistente apresenta protocolos e títulos e pergunta se é o mesmo assunto ou um novo pedido. A escolha explícita do funcionário prevalece sobre uma classificação inadequada do modelo naquele clique.

A escolha vale para o contexto atual e é consumida ao preparar o rascunho. Consultar outros chamados ou sair da triagem limpa escolhas pendentes. O rascunho mostra o protocolo real, o motivo e, quando diferente, o título relatado originalmente. Nenhum chamado é criado, complementado ou reaberto só por causa da análise ou da resposta à pergunta: ainda é preciso confirmar o rascunho.

Na confirmação, a API compara o conjunto e as versões dos candidatos com o contexto revisado. Mudanças exigem nova revisão. Repetir uma confirmação já concluída retorna o mesmo resultado. Editar um novo pedido invalida a decisão semântica anterior; a verificação conservadora de título volta a impedir a criação sobre um protocolo equivalente sem revisão. Complementos a um protocolo escolhido explicitamente continuam usando o alvo selecionado e a confirmação habitual.

Casos críticos não aguardam o desempate para entrar na fila humana. Se houver dúvida de duplicidade, o suporte recebe o contexto sem um rascunho apontando para um protocolo presumido. O encaminhamento direto entre analistas N1/N2 permanece fora deste escopo.

## Validação

- Testes PostgreSQL cobrem títulos distintos para o mesmo pedido, programas diferentes, títulos iguais para assuntos distintos, evidências inventadas/genéricas/repetidas, alvo indevido, esclarecimento pelo funcionário, alterações durante a análise e antes da confirmação, criticidade e privacidade.
- Um teste do endpoint verifica que os candidatos autorizados seguem na mesma chamada de triagem, sem uma chamada adicional de duplicidade.
- A jornada de navegador cobre pergunta, escolha do protocolo, rascunho revisável e ausência de alteração antes da confirmação.
- O modo stub oferece decisões determinísticas para CI; não é uma simulação da capacidade semântica do modelo real.
- Duas chamadas reais, somente leitura, passaram em 30/10/2026: QGIS versus FluxogramaQA retornou `different` em cerca de 4,9 s; o mesmo pedido de QGIS com títulos distintos retornou `same`, com evidências verificáveis, em cerca de 3,6 s. Foram informados 2.545 tokens de entrada e 629 de saída no total. Essa amostra não representa garantia universal nem estimativa de cobrança.

Para repetir apenas a verificação real, com o agente configurado em modo live:

```powershell
Get-Content -Raw -Encoding utf8 scripts/verify-duplicate-live.py | docker compose exec -T api python -
```

O roteiro faz no máximo duas chamadas, sem retentativa automática, e não consulta nem modifica registros históricos da auditoria. Históricos já misturados não são separados por esta alteração.
