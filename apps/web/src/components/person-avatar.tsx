import { initials } from "@/lib/api";

// Presença ilustrativa, estável entre recarregamentos; não representa telemetria.
export function demoPresence(email: string): "online" | "offline" {
  return email === "carla.mendes@nexo.com.br" ? "offline" : "online";
}

export function PersonAvatar({
  name,
  presence,
}: {
  name: string;
  presence?: "online" | "offline";
}) {
  return (
    <span className="avatar person-avatar" title={name}>
      <span aria-hidden="true">{initials(name)}</span>
      {presence && (
        <span
          className={`presence-dot ${presence}`}
          role="img"
          aria-label={`${name}: ${presence === "online" ? "Online" : "Offline"} (presença simulada)`}
        />
      )}
    </span>
  );
}
