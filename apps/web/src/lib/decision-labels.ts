import { labels } from "./api";

export const intentLabels: Record<string, string> = {
  help: "Orientação de TI",
  consult: "Consultar chamados",
  create: "Preparar novo chamado",
  update: "Complementar chamado",
  handoff: "Encaminhar ao suporte",
  out_of_scope: "Redirecionar assunto fora de TI",
  clarify: "Esclarecer informações",
};

export const factLabels: Record<string, string> = {
  os: "Sistema operacional",
  category: "Categoria",
  title: "Título",
  description: "Descrição",
  kind: "Tipo",
  affected_scope: "Pessoas afetadas",
  blocked: "Impede o trabalho",
  same_day: "Compromisso em risco hoje",
  workaround: "Há alternativa para continuar",
};

export const ruleLabels: Record<string, string> = {
  OWNER_SCOPE: "Acesso restrito aos seus chamados",
  CONFIRM_BEFORE_WRITE: "Confirmação antes de alterar chamados",
  PENDING_UPDATE_CONTEXT: "Complemento do chamado selecionado",
  CRITICAL: "Impacto crítico exige atendimento humano",
  LOW_CONFIDENCE: "Segurança insuficiente para decidir",
  USER_REQUEST: "Atendimento humano solicitado",
  OVERDUE_HANDOFF: "Prazo vencido exige atendimento humano",
  IMPACT_URGENCY: "Prioridade por impacto e urgência",
  BUSINESS_CALENDAR: "Prazos conforme o calendário de atendimento",
  CHECK_DUPLICATES: "Verificação de chamados semelhantes",
};

export function factValue(value: string | boolean | null): string {
  if (value === null) return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return labels[value] ?? value;
}
