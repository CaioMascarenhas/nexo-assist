"use client";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Pencil,
  X,
} from "lucide-react";
import {
  api,
  date,
  labels,
  post,
  type Decision,
  type Draft,
  type Ticket,
} from "@/lib/api";
import {
  factLabels,
  factValue,
  intentLabels,
  ruleLabels,
} from "@/lib/decision-labels";

export function DecisionDetail({ decision }: { decision: Decision }) {
  return (
    <div className="decision">
      <div className="action-chips">
        {decision.actions.map((a, i) => (
          <span key={i}>
            <Check size={11} />
            {a}
          </span>
        ))}
      </div>
      <details>
        <summary>
          Entenda esta decisão <ChevronDown size={12} />
        </summary>
        <div className="decision-panel">
          <div className="decision-heading">
            <strong>Detalhes da decisão</strong>
            <span className="pill">
              {decision.mode === "stub" ? "Demonstração" : "Gemini"}
            </span>
          </div>
          <dl>
            <dt>Intenção</dt>
            <dd>
              {intentLabels[decision.intent] ?? "Intenção não identificada"}
            </dd>
            <dt>
              {decision.confidence_source === "user_choice"
                ? "Origem da decisão"
                : "Segurança estimada"}
            </dt>
            <dd>
              {decision.confidence_source === "user_choice"
                ? "Escolha explícita do funcionário"
                : `${Math.round(decision.confidence * 100)}% · estimativa não calibrada`}
            </dd>
          </dl>
          <p>{decision.rationale}</p>
          <div className="fact-list">
            {Object.entries(decision.facts).map(([k, v]) => (
              <span key={k}>
                {factLabels[k] ?? "Informação adicional"}: {factValue(v)}
              </span>
            ))}
          </div>
          <p className="muted small">
            Regras:{" "}
            {decision.rules
              .map((rule) => ruleLabels[rule] ?? "Regra do service desk")
              .join(" · ")}
          </p>
          {decision.sources.map((s) => (
            <div className="source" key={s.id}>
              <strong>{s.title}</strong>
              <span>
                {s.applicable ? "Aplicável" : "Não se aplica ao contexto"}
              </span>
              <p>{s.content}</p>
            </div>
          ))}
          {decision.duration_ms !== undefined && (
            <p className="muted small">
              {(decision.duration_ms / 1000).toFixed(1)} s ·{" "}
              {decision.usage.input_tokens ?? "—"} tokens de entrada ·{" "}
              {decision.usage.output_tokens ?? "—"} de saída
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

export function TicketDeadline({ ticket }: { ticket: Ticket }) {
  const finished = ["RESOLVED", "CLOSED"].includes(ticket.status);
  return (
    <div className={`deadline ${ticket.overdue && !finished ? "late" : ""}`}>
      {finished ? (
        <>
          {ticket.status === "CLOSED" ? "Encerrado" : "Resolvido"}
          {ticket.resolved_at
            ? ` em ${date(ticket.resolved_at)}`
            : " pelo suporte"}
        </>
      ) : (
        <>
          {ticket.overdue ? <CircleAlert size={14} /> : <Clock3 size={14} />}{" "}
          {ticket.overdue ? "Prazo vencido" : "Prazo de resposta"} ·{" "}
          {date(ticket.due_at)}
        </>
      )}
    </div>
  );
}

export function TicketHistory({ ticket }: { ticket: Ticket }) {
  const updates = ticket.updates ?? [];
  const lastReopen = updates.findLastIndex(
    (update) => update.type === "reopen",
  );
  const resolution = updates.findLast(
    (update, index) => update.type === "resolution" && index > lastReopen,
  );
  return (
    <>
      {resolution && (
        <section className="ticket-solution" aria-label="Solução registrada">
          <strong>Solução registrada</strong>
          <p>{resolution.content}</p>
          <small>
            {resolution.author ?? "Suporte"} · {date(resolution.at)}
          </small>
        </section>
      )}
      {updates.length > 0 && (
        <details className="ticket-updates">
          <summary>Histórico do chamado ({updates.length})</summary>
          <ol>
            {[...updates].reverse().map((update, index) => (
              <li key={`${update.at}-${index}`}>
                <strong>
                  {update.type === "resolution"
                    ? "Solução registrada"
                    : update.type === "reopen"
                      ? "Reabertura"
                      : update.type === "transfer"
                        ? "Encaminhamento ao suporte"
                        : "Atualização"}
                </strong>
                <small>
                  {update.author ?? "Service desk"} · {date(update.at)}
                </small>
                {(update.summary || update.content) && (
                  <p>{update.summary || update.content}</p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}

export function TicketCard({
  ticket,
  onSelect,
  compact = false,
}: {
  ticket: Ticket;
  onSelect?: (ticket: Ticket) => void;
  compact?: boolean;
}) {
  if (compact) {
    const Container = onSelect ? "button" : "div";
    return (
      <Container
        className="ticket-list-item"
        onClick={onSelect ? () => onSelect(ticket) : undefined}
      >
        <div>
          <span className="mono">{ticket.code}</span>
          <strong>{ticket.title}</strong>
          <span className="muted small">
            {labels[ticket.status] ?? ticket.status}
          </span>
        </div>
        {onSelect && <ChevronRight size={15} />}
      </Container>
    );
  }
  return (
    <article className="ticket-card">
      <div className="card-top">
        <span className="muted small">
          <FileText size={13} /> Chamado <b className="mono">{ticket.code}</b>
        </span>
        <span className={`pill ${ticket.overdue ? "warning" : ""}`}>
          {labels[ticket.status] ?? ticket.status}
        </span>
      </div>
      <h3>{ticket.title}</h3>
      <p>{ticket.description}</p>
      <div className="ticket-grid">
        <div>
          <span>Categoria</span>
          <strong>{ticket.category}</strong>
        </div>
        <div>
          <span>Prioridade</span>
          <strong>{labels[ticket.priority]}</strong>
        </div>
        <div>
          <span>Aberto em</span>
          <strong>{date(ticket.created_at)}</strong>
        </div>
        <div>
          <span>Última atualização do suporte</span>
          <strong>{date(ticket.support_updated_at)}</strong>
        </div>
      </div>
      <TicketDeadline ticket={ticket} />
      <TicketHistory ticket={ticket} />
    </article>
  );
}

export function DraftCard({
  draft,
  canConfirm = true,
  onChanged,
  onError,
}: {
  draft: Draft;
  canConfirm?: boolean;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [title, setTitle] = useState(draft.payload.title);
  const [description, setDescription] = useState(draft.payload.description);
  const pending = draft.status === "PENDING" && !draft.expired;
  async function action(kind: "confirm" | "cancel" | "edit") {
    setWorking(true);
    try {
      if (kind === "edit")
        await api(`/drafts/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            revision: draft.revision,
            title,
            description,
          }),
        });
      else
        await post(`/drafts/${draft.id}/${kind}`, { revision: draft.revision });
      setEditing(false);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <article className="ticket-card draft-card">
      <div className="card-top">
        <span className="muted small">
          <FileText size={13} />
          {labels[draft.operation]}
        </span>
        <span className={`pill ${pending ? "warning" : ""}`}>
          {draft.expired
            ? "Expirado"
            : pending
              ? "Aguardando confirmação"
              : draft.status === "COMMITTED"
                ? "Concluído"
                : draft.status === "CANCELLED"
                  ? "Cancelado"
                  : "Substituído"}
        </span>
      </div>
      {editing ? (
        <>
          <label>
            Título
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              readOnly={draft.operation !== "CREATE"}
            />
          </label>
          {draft.operation !== "CREATE" && (
            <p className="muted small">
              O título identifica o chamado existente. Edite a descrição do
              complemento.
            </p>
          )}
          <label>
            Descrição
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </label>
        </>
      ) : (
        <>
          <h3>{draft.payload.title}</h3>
          {draft.payload.update_summary ? (
            <>
              <p>{draft.payload.update_summary}</p>
              <details>
                <summary>Relato do funcionário</summary>
                <p>{draft.payload.description}</p>
              </details>
            </>
          ) : (
            <p>{draft.payload.description}</p>
          )}
        </>
      )}
      {draft.payload.priority_review && (
        <p className="notice" aria-label="Reavaliação da prioridade">
          {draft.payload.priority_review.reason}
        </p>
      )}
      {!!draft.payload.duplicate_review?.candidates.length && (
        <div className="notice" aria-label="Verificação de duplicidade">
          <p>
            {draft.payload.duplicate_review.result === "same"
              ? `Este pedido será vinculado ao chamado ${draft.target_code}: ${draft.payload.title}. Confira se é o mesmo assunto antes de confirmar.`
              : "Este pedido será registrado em um novo protocolo após sua confirmação."}
          </p>
          <p>{draft.payload.duplicate_review.reason}</p>
          {draft.payload.duplicate_review.requested_title !==
            draft.payload.title && (
            <p>
              Pedido relatado: {draft.payload.duplicate_review.requested_title}
            </p>
          )}
        </div>
      )}
      <div className="ticket-grid">
        <div>
          <span>Tipo / categoria</span>
          <strong>
            {labels[draft.payload.kind]} · {draft.payload.category}
          </strong>
        </div>
        <div>
          <span>Prioridade</span>
          <strong>{labels[draft.payload.priority]}</strong>
        </div>
        <div>
          <span>Afetados</span>
          <strong>{labels[draft.payload.affected_scope]}</strong>
        </div>
        <div>
          <span>Operação</span>
          <strong>
            {draft.target_code ?? "Novo protocolo após confirmar"}
          </strong>
        </div>
      </div>
      {draft.payload.due_at && (
        <div className="deadline">
          <Clock3 size={14} /> Previsão de resposta:{" "}
          {date(draft.payload.due_at)}
        </div>
      )}
      {pending && (
        <div className="draft-actions">
          <button
            className="primary"
            disabled={working || !canConfirm}
            onClick={() => action(editing ? "edit" : "confirm")}
          >
            <Check size={14} />
            {editing ? "Salvar revisão" : "Confirmar"}
          </button>
          <button
            className="text-button"
            disabled={working || !canConfirm}
            onClick={() => setEditing(!editing)}
          >
            <Pencil size={13} />
            {editing ? "Voltar" : "Editar"}
          </button>
          <button
            className="text-button"
            disabled={working}
            onClick={() => action("cancel")}
          >
            <X size={14} />
            Cancelar
          </button>
        </div>
      )}
      {draft.expired && (
        <p className="notice">
          Este rascunho expirou. Peça um novo rascunho na conversa antes de
          confirmar.
        </p>
      )}
      {pending && !canConfirm && (
        <p className="notice">
          O atendimento está com o suporte ou foi encerrado. O rascunho não foi
          efetivado; combine a alteração com o analista ou aguarde a devolução
          ao assistente.
        </p>
      )}
    </article>
  );
}
