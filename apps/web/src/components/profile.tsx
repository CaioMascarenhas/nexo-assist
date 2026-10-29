import { KeyRound, LockKeyhole, Mail, RotateCcwKey } from "lucide-react";
import type { User } from "@/lib/api";

export function ProfileLogo() {
  return (
    <span className="brand profile-brand">
      <svg width="20" height="20" viewBox="0 0 28 28" aria-hidden="true">
        <path
          transform="translate(1.806 3.6821)"
          fill="#037AF6"
          d="M21.763 0.24493l-3.374 1.687c-0.623 0.308-0.973 0.903-0.973 1.631l0 6.293-11.193-9.429c-0.623-0.469-1.372-0.553-2.03-0.245l-3.185 1.631c-0.651 0.322-1.008 0.924-1.008 1.673l0 15.218c0 1.477 1.526 2.289 2.716 1.785l3.073-1.617c0.693-0.322 1.057-0.952 1.057-1.722l0-7.7 11.732 10.591c0.602 0.546 1.421 0.679 2.086 0.364l2.786-1.505c0.602-0.315 0.938-0.931 0.938-1.68l0-15.288c0-1.463-1.505-2.275-2.625-1.687z"
        />
      </svg>
      Nexo Assist
    </span>
  );
}

export function Profile({ user }: { user: User }) {
  return (
    <section className="profile">
      <header className="profile-heading">
        <h1>Meu perfil</h1>
        <p>Seus dados de acesso ao service desk de TI.</p>
      </header>
      <dl className="profile-card profile-data">
        <div className="profile-data-row">
          <dt>Nome</dt>
          <dd>{user.name}</dd>
        </div>
        <div className="profile-data-row">
          <dt>E-mail corporativo</dt>
          <dd>{user.email}</dd>
          <dd className="profile-managed">
            <LockKeyhole size={13} />
            Gerenciado pela TI
          </dd>
        </div>
      </dl>
      <section className="profile-card profile-password" aria-label="Senha">
        <div className="profile-password-row">
          <span className="profile-key">
            <KeyRound size={18} />
          </span>
          <div className="profile-password-copy">
            <h2>Senha</h2>
            <p>Alterada há 42 dias</p>
          </div>
          <button
            type="button"
            className="profile-reset"
            title="Exemplo visual de redefinição de senha"
          >
            <RotateCcwKey size={15} />
            Redefinir senha
          </button>
        </div>
        <div className="profile-password-helper">
          <Mail size={14} />
          <span>Enviaremos um link de redefinição para {user.email}.</span>
        </div>
      </section>
    </section>
  );
}
