"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  Headphones,
  LoaderCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { post, type User } from "@/lib/api";
import { Logo } from "./brand";

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [password, setPassword] = useState("demo");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await post<User>("/auth/login", { email, password, remember }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <section className="showcase">
        <Logo light />
        <div className="showcase-content">
          <span className="eyebrow">SERVICE DESK DE TI DA NEXO</span>
          <h1>
            Seu problema de TI,
            <br />
            resolvido em uma conversa.
          </h1>
          <p>
            Descreva o que está acontecendo. O assistente consulta seus
            chamados, busca na central de ajuda e chama um analista quando
            precisa.
          </p>
          <div className="sample-chat">
            <div className="sample-user">
              Meu notebook não conecta na VPN. Erro 809.
            </div>
            <div className="sample-reply">
              <span>
                <Bot size={14} />
                Nexo Assist
              </span>
              <small>
                <Check size={11} /> abriu o chamado · encaminhou ao suporte
              </small>
              <p>
                Abri um chamado com prioridade alta e encaminhei para um
                analista. Seu histórico foi preservado.
              </p>
              <div className="sample-ticket">
                <span className="blue-dot" /> Rede e VPN · Alta · 4 h úteis
              </div>
            </div>
          </div>
        </div>
        <div className="showcase-bottom">
          <div>
            <strong>8</strong>
            <span>artigos na central</span>
          </div>
          <div>
            <strong>24 h</strong>
            <span>plantão para casos críticos</span>
          </div>
          <div>
            <strong>30</strong>
            <span>mensagens por sessão</span>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-help">
          Problema para entrar?{" "}
          <button
            onClick={() =>
              setError(
                "Use uma das contas de demonstração abaixo, com qualquer senha não vazia.",
              )
            }
          >
            Ajuda com o acesso
          </button>
        </div>
        <form onSubmit={submit}>
          <span className="eyebrow">BEM-VINDO AO NEXO ASSIST</span>
          <h2>Entrar</h2>
          <p>Use seu e-mail corporativo para acessar o service desk.</p>
          <label>
            E-mail corporativo
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            <span>
              Senha <span className="muted small">Demonstração</span>
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Manter conectado neste computador
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary login-submit" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <>
                Entrar
                <ArrowRight size={16} />
              </>
            )}
          </button>
          <div className="demo-accounts">
            <span>CONTAS DE DEMONSTRAÇÃO · QUALQUER SENHA</span>
            <button
              type="button"
              onClick={() => setEmail("ana.souza@nexo.com.br")}
            >
              <UserRound size={14} /> Ana · Funcionária <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => setEmail("rafael.lima@nexo.com.br")}
            >
              <Headphones size={14} /> Rafael · Suporte N2{" "}
              <ArrowRight size={13} />
            </button>
          </div>
        </form>
        <footer>
          © 2026 Nexo · Service desk de TI{" "}
          <span>
            <ShieldCheck size={12} /> Ambiente demonstrativo
          </span>
        </footer>
      </section>
    </main>
  );
}
