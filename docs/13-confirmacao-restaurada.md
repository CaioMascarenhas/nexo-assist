# Rascunho e confirmação restaurados

A issue #63 restaura o comportamento solicitado no Anexo A do PRD, revertendo a remoção de confirmação da issue #48. As correções de orientação resolvida, diagnóstico do modelo e resolução de chamados pelo analista permanecem.

## Fluxo normal

1. O assistente coleta os dados e procura chamados semelhantes.
2. A API salva um rascunho PENDING de CREATE, UPDATE ou REOPEN. O chamado ainda não é criado, complementado ou reaberto.
3. O funcionário pode editar o título/descrição de um novo chamado, revisar o complemento de um existente, cancelar ou confirmar.
4. Confirmar verifica dono, ID/revisão, validade, versão do alvo e estado da conversa. A API efetiva a operação e encaminha à fila humana na mesma transação.
5. Repetir uma confirmação concluída retorna o mesmo chamado sem duplicar escrita, mensagem ou transferência. Se houver falha antes do commit, a operação é desfeita e o rascunho continua pendente.

## Casos críticos

O encaminhamento é imediato. Com dados suficientes, o usuário recebe um rascunho enquanto a conversa fica WAITING_ANALYST por motivo CRITICAL. Esse rascunho pode ser confirmado na fila; a exceção é restrita a rascunhos críticos preparados pelo servidor. Não permite confirmar rascunhos comuns após uma transferência manual.

Se um analista assumir primeiro, HUMAN_ACTIVE bloqueia a confirmação. O funcionário pode cancelar o rascunho ou combinar o caso com o suporte. Após devolução ao assistente, poderá confirmar se a revisão, validade e versão do alvo ainda forem válidas. Dados insuficientes ou baixa confiança continuam sendo encaminhados sem inventar um chamado.

Resolver uma orientação pelo chat não resolve protocolos existentes. Também retira rascunhos pendentes da mesma conversa, evitando que um problema já solucionado seja registrado por engano.

## Validação

Os testes cobrem ausência de mutações antes da confirmação, criação/complemento/reabertura, edição e cancelamento, replay, falha de transferência com rollback, confirmação crítica na fila, bloqueio após assunção e preservação de SLA. As jornadas de navegador verificam os botões e a transferência após confirmar. Scripts de persistência e avaliação live foram ajustados ao novo fluxo.
