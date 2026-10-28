"use client";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api, post, type User } from "@/lib/api";
import { Logo } from "./brand";
import { Login } from "./login";
import { Workspace } from "./workspace";

export default function NexoApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<User>("/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    await post("/auth/logout");
    setUser(null);
  }
  if (loading)
    return (
      <main className="initial-loading">
        <Logo />
        <LoaderCircle className="spin" size={22} />
      </main>
    );
  if (!user) return <Login onLogin={setUser} />;
  return <Workspace user={user} onLogout={logout} />;
}
