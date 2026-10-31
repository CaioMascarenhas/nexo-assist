export interface User {
  id: string;
  name: string;
  email: string;
  role: "EMPLOYEE" | "ANALYST";
  department: string;
}
export type Analyst = Pick<User, "id" | "name" | "department">;
export interface Ticket {
  id: string;
  code: string;
  title: string;
  description: string;
  kind: string;
  category: string;
  priority: string;
  status: string;
  version: number;
  affected_scope: string;
  due_at: string;
  support_updated_at: string;
  created_at: string;
  resolved_at?: string | null;
  overdue: boolean;
  updates?: {
    type?: string;
    author?: string;
    content?: string;
    summary?: string;
    at: string;
  }[];
}
export interface Decision {
  intent: string;
  confidence: number;
  confidence_source: string;
  rationale: string;
  facts: Record<string, string | boolean | null>;
  actions: string[];
  rules: string[];
  sources: {
    id: string;
    title: string;
    content: string;
    applicable: boolean;
  }[];
  mode: string;
  duration_ms?: number;
  usage: Record<string, string | number | null>;
}
export interface Draft {
  id: string;
  operation: string;
  revision: number;
  status: string;
  target_id: string | null;
  target_code: string | null;
  expired: boolean;
  expires_at: string;
  payload: {
    title: string;
    description: string;
    update_summary?: string;
    kind: string;
    category: string;
    priority: string;
    affected_scope: string;
    due_at?: string;
    handoff_reason?: string;
    duplicate_review?: {
      source: "agent" | "user";
      result: "same" | "different";
      reason: string;
      requested_title: string;
      candidates: { id: string; version: number }[];
    };
    priority_review?: {
      previous: string;
      proposed: string;
      reason: string;
      facts: Record<string, boolean>;
    };
  };
}
export interface Message {
  id: string;
  role: string;
  author: string;
  content: string;
  created_at: string;
  data: {
    quickReplies?: string[];
    tickets?: Ticket[];
    ticket_selection?: boolean;
    decision?: Decision;
    draft?: Draft;
    error?: boolean;
  };
}
export interface Conversation {
  selected_ticket_id?: string | null;
  id: string;
  user_id: string;
  state: string;
  analyst_id: string | null;
  assigned_analyst?: Analyst | null;
  turns: number;
  epoch: number;
  summary: string;
  handoff_reason: string | null;
  updated_at: string;
  user?: User;
  messages?: Message[];
  drafts?: Draft[];
  interrupted?: boolean;
  last_message?: string;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/me" &&
      !path.includes("/auth/login")
    )
      window.location.reload();
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : "Não foi possível concluir a operação.",
    );
  }
  return result as T;
}
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const labels: Record<string, string> = {
  INC: "Incidente",
  REQ: "Requisição",
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
  OPEN: "Aberto",
  WAITING_ANALYST: "Aguardando analista",
  IN_PROGRESS: "Em andamento",
  APPROVED: "Aprovado",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
  AGENT_ACTIVE: "Com o assistente",
  HUMAN_ACTIVE: "Em atendimento",
  CREATE: "Novo chamado",
  UPDATE: "Atualizar chamado",
  REOPEN: "Reabrir chamado",
  individual: "Somente você",
  team: "Sua equipe",
  company: "Toda a empresa",
};
export const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
