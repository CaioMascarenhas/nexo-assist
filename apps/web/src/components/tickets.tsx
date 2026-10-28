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
            <dd>{decision.intent}</dd>
            <dt>Segurança estimada</dt>
            <dd>
              {Math.round(decision.confidence * 100)}% · estimativa não
              calibrada
            </dd>
          </dl>
          <p>{decision.rationale}</p>
          <div className="fact-list">
            {Object.entries(decision.facts).map(([k, v]) => (
              <span key={k}>
                {k}: {String(v)}
              </span>
            ))}
          </div>
          <p className="muted small">Regras: {decision.rules.join(" · ")}</p>
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

export function TicketCard({
  ticket,
  onSelect,
  compact = false,
}: {
  ticket: Ticket;
  onSelect?: (ticket: Ticket) => void;
  compact?: boolean;
}) {
  if (compact)
    return (
      <button className="ticket-list-item" onClick={() => onSelect?.(ticket)}>
        <div>
          <span className="mono">{ticket.code}</span>
          <strong>{ticket.title}</strong>
          <span className="muted small">
            {labels[ticket.status] ?? ticket.status}
          </span>
        </div>
        <ChevronRight size={15} />
      </button>
    );
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
      <div className={`deadline ${ticket.overdue ? "late" : ""}`}>
        {ticket.overdue ? <CircleAlert size={14} /> : <Clock3 size={14} />}{" "}
        {ticket.overdue ? "Prazo vencido" : "Prazo de resposta"} ·{" "}
        {date(ticket.due_at)}
      </div>
    </article>
  );
}

export function DraftCard({
  draft,
  onChanged,
  onError,
}: {
  draft: Draft;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [title, setTitle] = useState(draft.payload.title);
  const [description, setDescription] = useState(draft.payload.description);
  const pending = draft.status === "PENDING";
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
          {pending
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
            />
          </label>
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
          <p>{draft.payload.description}</p>
        </>
      )}
      <div className="ticket-grid">
        <div>
          <span>Tipo / categoria</span>
          <strong>
            {draft.payload.kind} · {draft.payload.category}
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
          <strong>{draft.target_id ?? "Novo protocolo após confirmar"}</strong>
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
            disabled={working}
            onClick={() => action(editing ? "edit" : "confirm")}
          >
            <Check size={14} />
            {editing ? "Salvar revisão" : "Confirmar"}
          </button>
          <button
            className="text-button"
            disabled={working}
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
    </article>
  );
}
