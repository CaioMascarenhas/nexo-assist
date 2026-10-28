"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Headphones,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  api,
  date,
  initials,
  labels,
  post,
  type Conversation,
  type Message,
  type Ticket,
  type User,
} from "@/lib/api";
import { DecisionDetail, DraftCard, TicketCard } from "./tickets";
import { Logo } from "./brand";

export function Workspace({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const analyst = user.role === "ANALYST";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, storeSelected] = useState("");
  const selectedRef = useRef("");
  const setSelected = useCallback((id: string) => {
    selectedRef.current = id;
    storeSelected(id);
  }, []);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState("");
  const [view, setView] = useState("chat");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState("");
  const [activity, setActivity] = useState("");
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const loadList = useCallback(async () => {
    const path = analyst
      ? `/analyst/conversations?filter=${filter}&q=${encodeURIComponent(search)}`
      : "/conversations";
    const list = await api<Conversation[]>(path);
    setConversations(list);
    return list;
  }, [analyst, filter, search]);
  const loadConversation = useCallback(
    async (id: string) => {
      const data = await api<Conversation>(`/conversations/${id}`);
      if (selectedRef.current !== id) return data;
      setConversation(data);
      if (analyst) {
        const results = await api<Ticket[]>(
          `/analyst/conversations/${id}/tickets`,
        );
        if (selectedRef.current === id) setTickets(results);
      }
      return data;
    },
    [analyst],
  );
  useEffect(() => {
    let cancelled = false;
    loadList()
      .then(async (list) => {
        if (cancelled) return;
        if (!selected && list[0]) setSelected(list[0].id);
        else if (!selected && !list.length && !analyst) {
          const c = await post<Conversation>("/conversations");
          if (!cancelled) setSelected(c.id);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [loadList, analyst, selected]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        if (!cancelled) await loadConversation(selected);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    setConversation(null);
    setTickets([]);
    void refresh();
    const interval = setInterval(() => {
      void refresh();
      void loadList().catch(() => {});
    }, 2200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selected, loadConversation, loadList]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth" });
  }, [conversation?.messages?.length, partial, busy]);
  async function refresh() {
    if (selected) await loadConversation(selected);
    await loadList();
  }
  async function create() {
    try {
      const c = await post<Conversation>("/conversations");
      setSelected(c.id);
      setView("chat");
      await loadList();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send(content = text, ticket?: Ticket) {
    if (!content.trim() || !selected || busy) return;
    setBusy(true);
    setPartial("");
    setActivity("Recebendo sua mensagem…");
    setError("");
    setText("");
    try {
      const path = analyst
        ? `/analyst/conversations/${selected}/messages`
        : `/conversations/${selected}/messages`;
      const response = await fetch(`/api${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          client_id: crypto.randomUUID(),
          ticket_id: ticket?.id,
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : "Não foi possível enviar.",
        );
      }
      if (
        response.headers.get("content-type")?.includes("text/event-stream") &&
        response.body
      ) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((s) => s.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              data: unknown;
            };
            if (event.type === "action") setActivity(String(event.data));
            if (event.type === "delta")
              setPartial((p) => p + String(event.data));
            if (event.type === "error")
              setError((event.data as Message).content);
          }
        }
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPartial("");
      setActivity("");
    }
  }
  async function handoff() {
    try {
      await post(`/conversations/${selected}/handoff`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function transition(action: string) {
    if (!conversation) return;
    try {
      await post(`/analyst/conversations/${selected}/${action}`, {
        epoch: conversation.epoch,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const state = conversation?.state;
  const active = state === "AGENT_ACTIVE";
  const human = state === "HUMAN_ACTIVE";
  const canSend = analyst
    ? human && conversation?.analyst_id === user.id
    : state !== "CLOSED" && (!active || (conversation?.turns ?? 0) < 30);
  const lastAgent = [...(conversation?.messages ?? [])]
    .reverse()
    .find((m) => m.role === "AGENT");
  const lastDraft = conversation?.drafts
    ?.filter((d) => d.status === "PENDING")
    .at(-1);
  const mode = lastAgent?.data.decision?.mode;

  function timeline() {
    return (
      <>
        <div className="timeline-date">
          <span>
            {analyst ? "Histórico da conversa" : "Seu atendimento de TI"}
          </span>
        </div>
        {conversation?.messages?.map((m) => {
          if (m.role === "SYSTEM")
            return (
              <div
                className={`system-message ${m.data.error ? "error" : ""}`}
                key={m.id}
              >
                <ShieldCheck size={12} />
                <span>{m.content}</span>
                {m.data.tickets?.map((t) => (
                  <TicketCard key={t.id} ticket={t} />
                ))}
              </div>
            );
          return (
            <div
              className={`message ${m.role === "USER" ? "from-user" : "from-agent"}`}
              key={m.id}
            >
              {m.role !== "USER" && (
                <div className="message-author">
                  {m.role === "ANALYST" ? (
                    <Headphones size={14} />
                  ) : (
                    <span className="mini-brand">N</span>
                  )}
                  {m.author}
                  {m.role === "AGENT" && <span className="ai-label">IA</span>}
                </div>
              )}
              {m.data.decision && <DecisionDetail decision={m.data.decision} />}
              <div className="message-text">{m.content}</div>
              {m.data.tickets && (
                <div className="message-tickets">
                  {m.data.tickets.length > 1
                    ? m.data.tickets.map((t) => (
                        <TicketCard
                          key={t.id}
                          ticket={t}
                          compact
                          onSelect={(t) =>
                            send(`Qual o status do chamado ${t.code}?`, t)
                          }
                        />
                      ))
                    : m.data.tickets.map((t) => (
                        <TicketCard key={t.id} ticket={t} />
                      ))}
                </div>
              )}
              <time>
                {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          );
        })}
        {!analyst && lastDraft && (
          <DraftCard
            key={`${lastDraft.id}:${lastDraft.revision}`}
            draft={lastDraft}
            onChanged={() => void refresh()}
            onError={setError}
          />
        )}
        {!analyst && active && !busy && lastAgent?.data.quickReplies && (
          <div className="quick-replies">
            {lastAgent.data.quickReplies.map((q, i) => (
              <button
                key={q}
                onClick={() =>
                  q === "Falar com um analista" ? void handoff() : void send(q)
                }
              >
                <kbd>{i + 1}</kbd>
                {q}
              </button>
            ))}
          </div>
        )}
        {busy && (
          <div className="streaming" aria-live="polite">
            <div className="message-author">
              <span className="mini-brand">N</span>Nexo Assist
            </div>
            <p>
              {partial || (
                <>
                  <LoaderCircle size={13} className="spin" />
                  {activity}
                </>
              )}
            </p>
          </div>
        )}
        {conversation?.interrupted && (
          <div className="notice">
            A execução anterior foi interrompida. O histórico foi preservado;
            você pode enviar uma nova mensagem ou chamar um analista.
          </div>
        )}
        <div ref={bottom} />
      </>
    );
  }

  function composer() {
    return (
      <div className="composer-area">
        {state === "WAITING_ANALYST" && (
          <div className="handoff-banner">
            <Headphones size={17} />
            <div>
              <strong>
                {analyst
                  ? `${conversation?.user?.name.split(" ")[0]} espera um atendente`
                  : "Aguardando um analista"}
              </strong>
              <span>Agent pausado · contexto preservado</span>
            </div>
            {analyst && (
              <>
                <button
                  className="text-button"
                  onClick={() => transition("release")}
                >
                  Devolver ao agent
                </button>
                <button className="primary" onClick={() => transition("claim")}>
                  Assumir atendimento
                </button>
              </>
            )}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Mensagem"
            placeholder={
              analyst && !canSend
                ? "Assuma o atendimento para responder"
                : state === "CLOSED"
                  ? "Atendimento encerrado"
                  : "Escreva para o Nexo…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!canSend || busy}
            rows={2}
            maxLength={4000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            className="primary"
            aria-label="Enviar mensagem"
            disabled={!canSend || busy || !text.trim()}
          >
            <span>Enviar</span>
            <Send size={14} />
          </button>
        </form>
        <div className="composer-footer">
          <span>
            {analyst
              ? "Enter para enviar · Shift + Enter para nova linha"
              : `${conversation?.turns ?? 0}/30 mensagens nesta sessão`}
          </span>
          {!analyst && (
            <button onClick={handoff} disabled={state === "CLOSED" || !active}>
              <Headphones size={12} />
              Falar com um analista
            </button>
          )}
          <span>
            {mode === "live"
              ? "Gemini · decisões verificáveis"
              : "Modo demonstração · sem custo de LLM"}
          </span>
        </div>
        {!analyst && active && (conversation?.turns ?? 0) >= 30 && (
          <button className="text-button" onClick={create}>
            Iniciar nova sessão com histórico preservado
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`workspace ${analyst ? "analyst-workspace" : "employee-workspace"}`}
    >
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button aria-label="Fechar aviso" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {analyst ? (
        <aside className="analyst-rail">
          <span className="brand-symbol">
            N<span />
          </span>
          <button title="Conversas">
            <MessageSquare size={19} />
          </button>
          <button
            className="avatar rail-user"
            title={`${user.name} · sair`}
            onClick={onLogout}
          >
            {initials(user.name)}
          </button>
        </aside>
      ) : (
        <aside className="employee-sidebar">
          <Logo />
          <nav>
            <button
              className={view === "chat" ? "selected" : ""}
              onClick={() => setView("chat")}
            >
              <MessageSquare size={16} />
              Atendimento
            </button>
            <button
              className={view === "profile" ? "selected" : ""}
              onClick={() => setView("profile")}
            >
              <UserRound size={16} />
              Meu perfil
            </button>
          </nav>
          <button className="new-conversation" onClick={create}>
            <Plus size={14} />
            Novo atendimento
          </button>
          <div className="conversation-history">
            <span>SEUS ATENDIMENTOS</span>
            {conversations.slice(0, 6).map((c, i) => (
              <button
                key={c.id}
                className={c.id === selected ? "current" : ""}
                onClick={() => {
                  setSelected(c.id);
                  setView("chat");
                }}
              >
                <MessageSquare size={12} />
                <span>Atendimento {conversations.length - i}</span>
                <small>{labels[c.state]}</small>
              </button>
            ))}
          </div>
          <div className="sidebar-user">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <button title="Sair" onClick={onLogout}>
              <LogOut size={16} />
            </button>
          </div>
        </aside>
      )}
      {analyst && (
        <aside className="conversation-list">
          <div className="list-heading">
            <h1>Conversas</h1>
            <span className="pill green">
              <span className="green-dot" />
              Disponível
            </span>
          </div>
          <label className="search">
            <Search size={15} />
            <input
              aria-label="Pesquisar conversa ou chamado"
              placeholder="Pesquisar conversa ou chamado"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="conversation-filters">
            {[
              ["all", "Todas"],
              ["waiting", "Para você"],
              ["agent", "Com o agent"],
              ["mine", "Minhas"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? "selected" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="conversation-rows">
            {conversations.map((c) => (
              <button
                key={c.id}
                className={`conversation-row ${selected === c.id ? "selected" : ""}`}
                onClick={() => setSelected(c.id)}
              >
                <span
                  className={`avatar ${c.state === "WAITING_ANALYST" ? "amber" : ""}`}
                >
                  {initials(c.user?.name ?? "Usuário")}
                </span>
                <div>
                  <div className="row-title">
                    <strong>{c.user?.name}</strong>
                    <time>
                      {new Date(c.updated_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>{c.last_message}</p>
                  <span
                    className={`row-state ${c.state === "WAITING_ANALYST" ? "amber-text" : ""}`}
                  >
                    {c.state === "HUMAN_ACTIVE" && c.analyst_id === user.id
                      ? "Você está atendendo"
                      : labels[c.state]}
                  </span>
                </div>
              </button>
            ))}
            {!conversations.length && (
              <p className="empty-list">Nenhuma conversa neste filtro.</p>
            )}
          </div>
          <button className="console-logout" onClick={onLogout}>
            <LogOut size={14} />
            Sair · {user.name}
          </button>
        </aside>
      )}
      <main className="conversation-main">
        <header className="workspace-header">
          {analyst ? (
            <>
              <span className="avatar">
                {initials(conversation?.user?.name ?? "Usuário")}
              </span>
              <div className="header-person">
                <strong>
                  {conversation?.user?.name ?? "Selecione uma conversa"}
                </strong>
                <span>
                  {conversation?.user?.department ?? "Service desk de TI"}
                </span>
              </div>
              <div className="header-actions">
                {human && conversation?.analyst_id === user.id ? (
                  <>
                    <button onClick={() => transition("release")}>
                      Devolver ao agent
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => transition("close")}
                    >
                      Encerrar atendimento
                    </button>
                  </>
                ) : (
                  <span className={`pill ${active ? "green" : "warning"}`}>
                    {labels[state ?? ""] ?? "Atendimento"}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <span>Service desk de TI</span>
              <ChevronRight size={13} />
              <strong>
                {view === "profile" ? "Meu perfil" : "Atendimento"}
              </strong>
              <span
                className={`pill header-status ${active ? "green" : "warning"}`}
              >
                <span className={active ? "green-dot" : "amber-dot"} />
                {active
                  ? "Assistente online"
                  : human
                    ? "Analista atendendo"
                    : state === "CLOSED"
                      ? "Encerrado"
                      : "Aguardando atendente"}
              </span>
            </>
          )}
        </header>
        {view === "profile" && !analyst ? (
          <section className="profile">
            <h1>Meu perfil</h1>
            <p>Seus dados de acesso ao service desk de TI.</p>
            <div className="profile-card">
              <label>
                Nome<strong>{user.name}</strong>
              </label>
              <label>
                E-mail corporativo<strong>{user.email}</strong>
              </label>
              <span className="pill">Gerenciado pela TI</span>
            </div>
            <div className="notice">
              <ShieldCheck size={17} />
              <p>
                Esta é uma conta de demonstração. A senha informada no login não
                é armazenada.
              </p>
            </div>
          </section>
        ) : conversation ? (
          <>
            <div className={`timeline ${analyst ? "analyst-timeline" : ""}`}>
              <div className="timeline-inner">
                {analyst && conversation.summary && (
                  <details className="handoff-summary" open>
                    <summary>
                      <ShieldCheck size={13} />
                      Resumo da transferência <ChevronDown size={13} />
                    </summary>
                    <p>{conversation.summary}</p>
                  </details>
                )}
                {timeline()}
              </div>
            </div>
            {composer()}
          </>
        ) : (
          <div className="empty-conversation">
            <MessageSquare size={32} />
            <h2>
              {analyst
                ? "Seu próximo atendimento começa aqui"
                : "Carregando atendimento…"}
            </h2>
            <p>
              {analyst
                ? "Selecione uma conversa para ver o histórico e os chamados."
                : "Estamos recuperando seu histórico."}
            </p>
          </div>
        )}
      </main>
      {analyst && (
        <aside className="ticket-history">
          <h2>
            Chamados{" "}
            {conversation?.user
              ? `de ${conversation.user.name.split(" ")[0]}`
              : "do funcionário"}
          </h2>
          <p>
            {
              tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status))
                .length
            }{" "}
            abertos ·{" "}
            {
              tickets.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status))
                .length
            }{" "}
            resolvidos
          </p>
          <span className="section-label">CHAMADOS DO FUNCIONÁRIO</span>
          {tickets.map((t) => (
            <details className="side-ticket" key={t.id}>
              <summary>
                <span className="mono">{t.code}</span>
                <strong>{t.title}</strong>
                <span className={`pill ${t.overdue ? "warning" : ""}`}>
                  {labels[t.status]}
                </span>
              </summary>
              <p>{t.description}</p>
              <small>
                {t.category} · prioridade {labels[t.priority]}
              </small>
              <div className={t.overdue ? "amber-text" : "muted"}>
                Resposta: {date(t.due_at)}
              </div>
            </details>
          ))}
          {!tickets.length && (
            <p className="muted">Nenhum chamado para exibir.</p>
          )}
        </aside>
      )}
    </div>
  );
}
