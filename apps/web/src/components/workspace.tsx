"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Headphones,
  LoaderCircle,
  LogOut,
  MessageSquare,
  PanelLeft,
  PanelRight,
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
import { Profile, ProfileLogo } from "./profile";
import { demoPresence, PersonAvatar } from "./person-avatar";

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
  const orderedTickets = [...tickets].sort(
    (a, b) =>
      Number(b.id === conversation?.selected_ticket_id) -
      Number(a.id === conversation?.selected_ticket_id),
  );
  const [error, setError] = useState("");
  const [view, setView] = useState("chat");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const pendingRequests = useRef(new Set<string>());
  const [pending, setPending] = useState<string[]>([]);
  const [streams, setStreams] = useState<
    Record<string, { partial: string; activity: string }>
  >({});
  const busy = pending.includes(selected);
  const { partial = "", activity = "" } = streams[selected] ?? {};
  const listRequest = useRef(0);
  const historyRequest = useRef(0);
  const [runtimeMode, setRuntimeMode] = useState<
    "live" | "stub" | "unavailable" | null
  >(null);
  useEffect(() => {
    api<{ mode: "live" | "stub" | "unavailable" }>("/runtime")
      .then((result) => setRuntimeMode(result.mode))
      .catch(() => setRuntimeMode("unavailable"));
  }, []);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const listPath = analyst
    ? `/analyst/conversations?filter=${filter}&q=${encodeURIComponent(search)}`
    : "/conversations";
  const listScope = useRef(listPath);
  listScope.current = listPath;
  const loadList = useCallback(async () => {
    if (listPath !== listScope.current) return null;
    const request = ++listRequest.current;
    const list = await api<Conversation[]>(listPath);
    if (request !== listRequest.current || listPath !== listScope.current)
      return null;
    setConversations(list);
    return list;
  }, [listPath]);
  const loadConversation = useCallback(
    async (id: string) => {
      const request = ++historyRequest.current;
      const data = await api<Conversation>(`/conversations/${id}`);
      if (selectedRef.current !== id || request !== historyRequest.current)
        return data;
      setConversation(data);
      if (analyst) {
        const results = await api<Ticket[]>(
          `/analyst/conversations/${id}/tickets`,
        );
        if (selectedRef.current === id && request === historyRequest.current)
          setTickets(results);
      }
      return data;
    },
    [analyst],
  );
  useEffect(() => {
    let cancelled = false;
    loadList()
      .then(async (list) => {
        if (cancelled || !list) return;
        const current = selectedRef.current;
        if (analyst && !list.some((item) => item.id === current))
          setSelected(list[0]?.id ?? "");
        else if (!current && list[0]) setSelected(list[0].id);
        else if (!current && !list.length && !analyst) {
          const c = await post<Conversation>("/conversations");
          if (!cancelled) setSelected(c.id);
        }
      })
      .catch((e) => setError(e.message));
    const interval = setInterval(() => {
      void loadList().catch(() => {});
    }, 2200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadList, analyst, setSelected]);
  useEffect(() => {
    setText("");
    setError("");
    setConversation(null);
    setTickets([]);
    if (!selected) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        if (!cancelled) await loadConversation(selected);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 2200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selected, loadConversation]);
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
    const requestConversation = selected;
    if (
      !content.trim() ||
      !requestConversation ||
      pendingRequests.current.has(requestConversation)
    )
      return;
    pendingRequests.current.add(requestConversation);
    setPending([...pendingRequests.current]);
    function updateStream(
      update: Partial<{ partial: string; activity: string }>,
    ) {
      setStreams((current) => ({
        ...current,
        [requestConversation]: {
          ...(current[requestConversation] ?? { partial: "", activity: "" }),
          ...update,
        },
      }));
    }
    updateStream({ partial: "", activity: "Recebendo sua mensagem…" });
    setError("");
    setText("");
    try {
      const path = analyst
        ? `/analyst/conversations/${requestConversation}/messages`
        : `/conversations/${requestConversation}/messages`;
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
            if (event.type === "action")
              updateStream({ activity: String(event.data) });
            if (event.type === "delta")
              setStreams((current) => ({
                ...current,
                [requestConversation]: {
                  ...(current[requestConversation] ?? {
                    partial: "",
                    activity: "",
                  }),
                  partial:
                    (current[requestConversation]?.partial ?? "") +
                    String(event.data),
                },
              }));
            if (
              event.type === "error" &&
              selectedRef.current === requestConversation
            )
              setError((event.data as Message).content);
          }
        }
      }
      if (selectedRef.current === requestConversation)
        await loadConversation(requestConversation);
      await loadList();
    } catch (e) {
      if (selectedRef.current === requestConversation)
        setError((e as Error).message);
    } finally {
      pendingRequests.current.delete(requestConversation);
      setPending([...pendingRequests.current]);
      setStreams((current) => {
        const next = { ...current };
        delete next[requestConversation];
        return next;
      });
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
  const canSend =
    !!conversation &&
    (analyst
      ? human && conversation?.analyst_id === user.id
      : state !== "CLOSED" && (!active || (conversation?.turns ?? 0) < 30));
  const lastAgent = [...(conversation?.messages ?? [])]
    .reverse()
    .find((m) => m.role === "AGENT");
  const lastDraft = conversation?.drafts
    ?.filter((d) => d.status === "PENDING")
    .at(-1);
  const mode = runtimeMode;

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
              {(analyst || m.role !== "USER") && (
                <div className="message-author">
                  {m.role === "USER" || m.role === "ANALYST" ? (
                    <PersonAvatar name={m.author} />
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
                  {m.data.ticket_selection || m.data.tickets.length > 1
                    ? m.data.tickets.map((t) => (
                        <TicketCard
                          key={t.id}
                          ticket={t}
                          compact
                          onSelect={
                            analyst
                              ? undefined
                              : (t) =>
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
              <span>Assistente pausado · contexto preservado</span>
            </div>
            {analyst && (
              <>
                <button
                  className="text-button"
                  onClick={() => transition("release")}
                >
                  Devolver ao assistente
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
              : mode === "stub"
                ? "Modo demonstração · sem custo de LLM"
                : mode === "unavailable"
                  ? "Agente temporariamente indisponível"
                  : "Verificando modo do agente…"}
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
      className={`workspace ${analyst ? "analyst-workspace" : "employee-workspace"} ${!analyst && view === "profile" ? "profile-workspace" : ""}`}
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
          {view === "profile" ? <ProfileLogo /> : <Logo />}
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
          {view !== "profile" && (
            <>
              <button className="new-conversation" onClick={create}>
                <Plus size={14} />
                Novo atendimento
              </button>
              <details className="conversation-history">
                <summary aria-label="Retomar atendimento">
                  <MessageSquare size={16} />
                  <span>Retomar atendimento</span>
                  <ChevronDown size={14} />
                </summary>
                <div className="history-options">
                  {conversations.map((c, i) => (
                    <button
                      key={c.id}
                      className={c.id === selected ? "current" : ""}
                      onClick={(event) => {
                        setSelected(c.id);
                        setView("chat");
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                      }}
                    >
                      <MessageSquare size={12} />
                      <span>Atendimento {conversations.length - i}</span>
                      <small>{labels[c.state]}</small>
                    </button>
                  ))}
                </div>
              </details>
            </>
          )}
          <div className="sidebar-user">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            {view !== "profile" && (
              <button title="Sair" onClick={onLogout}>
                <LogOut size={16} />
              </button>
            )}
          </div>
          {view === "profile" && (
            <button className="profile-logout" onClick={onLogout}>
              <LogOut size={16} />
              Sair
            </button>
          )}
        </aside>
      )}
      {analyst && (
        <aside
          className={`conversation-list ${listOpen ? "is-open" : ""}`}
          aria-label="Lista de conversas"
        >
          <div className="list-heading">
            <h1>Conversas</h1>
            <button
              className="drawer-close"
              aria-label="Fechar conversas"
              onClick={() => setListOpen(false)}
            >
              <X size={18} />
            </button>
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
              ["agent", "Com o assistente"],
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
                onClick={() => {
                  setSelected(c.id);
                  setListOpen(false);
                }}
              >
                <PersonAvatar
                  name={c.user?.name ?? "Usuário"}
                  presence={demoPresence(c.user?.email ?? "")}
                />
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
              <button
                className="drawer-toggle list-toggle"
                aria-label="Mostrar conversas"
                aria-expanded={listOpen}
                onClick={() => setListOpen(!listOpen)}
              >
                <PanelLeft size={20} />
              </button>
              <PersonAvatar
                name={conversation?.user?.name ?? "Usuário"}
                presence={
                  conversation?.user
                    ? demoPresence(conversation.user.email)
                    : undefined
                }
              />
              <div className="header-person">
                <strong>
                  {conversation?.user?.name ?? "Selecione uma conversa"}
                </strong>
                <span>
                  {conversation?.user
                    ? `${demoPresence(conversation.user.email) === "online" ? "Online" : "Offline"} · ${conversation.user.department} · presença simulada`
                    : "Service desk de TI"}
                </span>
              </div>
              <div className="header-actions">
                {human && conversation?.analyst_id === user.id ? (
                  <>
                    <button onClick={() => transition("release")}>
                      Devolver ao assistente
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
              <button
                className="drawer-toggle tickets-toggle"
                aria-label="Mostrar chamados"
                aria-expanded={ticketsOpen}
                onClick={() => setTicketsOpen(!ticketsOpen)}
              >
                <PanelRight size={20} />
              </button>
            </>
          ) : (
            <>
              <span>Service desk de TI</span>
              <ChevronRight size={13} />
              <strong>
                {view === "profile" ? "Meu perfil" : "Atendimento"}
              </strong>
              {view !== "profile" && (
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
              )}
            </>
          )}
        </header>
        {view === "profile" && !analyst ? (
          <Profile user={user} />
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
        <aside
          className={`ticket-history ${ticketsOpen ? "is-open" : ""}`}
          aria-label="Chamados do funcionário"
        >
          <button
            className="drawer-close"
            aria-label="Fechar chamados"
            onClick={() => setTicketsOpen(false)}
          >
            <X size={18} />
          </button>
          <h2>
            Chamados{" "}
            {conversation?.user
              ? `de ${conversation.user.name.split(" ")[0]}`
              : "do funcionário"}
          </h2>
          <p>
            Abertos:{" "}
            {
              tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status))
                .length
            }{" "}
            · Resolvidos:{" "}
            {
              tickets.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status))
                .length
            }{" "}
          </p>
          {orderedTickets.map((t, index) => (
            <Fragment key={t.id}>
              {(index === 0 ||
                orderedTickets[index - 1]?.id ===
                  conversation?.selected_ticket_id) && (
                <span className="section-label">
                  {t.id === conversation?.selected_ticket_id
                    ? "DESTA CONVERSA"
                    : "OUTROS CHAMADOS"}
                </span>
              )}
              <details className="side-ticket">
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
            </Fragment>
          ))}
          {!tickets.length && (
            <p className="muted">Nenhum chamado para exibir.</p>
          )}
        </aside>
      )}
    </div>
  );
}
