"use client";
import { appPath } from "@/lib/app-path";

import { useEffect, useState, type FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Smartphone, ShieldCheck } from "lucide-react";
import useSWR, { SWRConfig } from "swr";
import { isLocalInventory } from "@/lib/local-register";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/register-api";
import { DeviceAdminDashboard } from "./device-admin-dashboard";

export function AdminAccess() {
  const [local, setLocal] = useState(false);
  useEffect(() => { setLocal(isLocalInventory()); }, []);
  if (local) return <SWRConfig value={{ provider: () => new Map() }}><DeviceAdminDashboard email="Local inventory (this browser)" onSignOut={async () => { window.location.reload(); }} signOutError="" /></SWRConfig>;
  return <RemoteAccess />;
}

function RemoteAccess() {
  const [client] = useState(getSupabase);
  if (!client) return <AccessFrame title="Connection pending"><p>The device register is waiting for its Supabase connection.</p><p className="muted">No inventory has been loaded.</p></AccessFrame>;
  return <ConnectedAccess client={client} />;
}

function ConnectedAccess({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setReady(true); }
    });
    client.auth.getSession().then(({ error }) => {
      if (active && error) { setFailure(errorMessage(error)); setReady(true); }
    }).catch((error) => { if (active) { setFailure(errorMessage(error)); setReady(true); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  if (!ready) return <AccessFrame title="Checking your session"><p role="status">Connecting...</p></AccessFrame>;
  if (!session) return <SignIn client={client} initialError={failure} />;
  return <SWRConfig key={session.user.id} value={{ provider: () => new Map(), shouldRetryOnError: false, revalidateOnFocus: true }}>
    <AuthorizedAdmin client={client} session={session} />
  </SWRConfig>;
}

function AuthorizedAdmin({ client, session }: { client: SupabaseClient; session: Session }) {
  const { data, error, isLoading, mutate } = useSWR(["admin-access", session.user.id], async () => {
    const result = await client.from("dm_admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (result.error) throw result.error;
    return !!result.data;
  });
  const [signOutError, setSignOutError] = useState("");
  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) setSignOutError(errorMessage(error));
  }
  if (isLoading) return <AccessFrame title="Checking admin access"><p role="status">One moment...</p></AccessFrame>;
  if (error || !data) return <AccessFrame title={error ? "Unable to open the register" : "Admin access required"}>
    <p role={error ? "alert" : undefined}>{error ? errorMessage(error) : "Your account has not been granted access to this register."}</p>
    <p className="muted">{session.user.email}</p>
    {signOutError && <p role="alert">{signOutError}</p>}
    <div className="modal-actions"><button className="button secondary" onClick={signOut}>Sign out</button><button className="button primary" onClick={() => void mutate()}>Try again</button></div>
  </AccessFrame>;
  return <DeviceAdminDashboard email={session.user.email ?? "Admin"} onSignOut={signOut} signOutError={signOutError} />;
}

export function SignIn({ client, initialError }: { client: SupabaseClient; initialError: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const result = await client.auth.signInWithPassword({ email: String(form.get("email")).trim(), password: String(form.get("password")) });
      if (result.error) throw result.error;
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  }
  return <AccessFrame title="Sign in to your register">
    <form className="modal-form" onSubmit={submit}>
      <label>Email<input name="email" type="email" autoComplete="username" required autoFocus /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" disabled={pending}><ShieldCheck size={17} />{pending ? "Signing in..." : "Sign in"}</button>
    </form>
    <p><a href={appPath("/signup?mode=reset")}>Forgot your password?</a></p>
    <p className="muted">New employee? <a href={appPath("/signup")}>Create your account</a></p>
  </AccessFrame>;
}

function AccessFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="access-page"><section className="access-content">
    <div className="brand"><span className="brand-mark"><Smartphone size={22} /></span><span>Device<strong>Management</strong></span></div>
    <p className="eyebrow">Admin workspace</p><h1>{title}</h1><div className="access-body">{children}</div>
  </section></main>;
}
