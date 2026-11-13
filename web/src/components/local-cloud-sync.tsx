"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/register-api";
import { syncLocalInventory } from "@/lib/local-sync";

export function LocalCloudSync() {
  const [client] = useState(getSupabase);
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("Local changes stay in this browser until you connect an admin account.");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const run = useRef<() => void>(() => {});

  useEffect(() => {
    if (!client) return;
    let disposed = false;
    let running = false;
    let queued = false;
    let connected = false;
    async function sync() {
      if (!connected || disposed) return;
      if (running) { queued = true; return; }
      running = true;
      setBusy(true); setFailure(""); setMessage("Saving local changes to Supabase...");
      try {
        if (!navigator.locks) throw new Error("This browser needs Web Locks support to sync safely. Use a current browser on localhost.");
        await navigator.locks.request("device-manager-local-sync", () => syncLocalInventory(client!));
        if (!disposed) setMessage("Local changes saved to Supabase. New edits sync automatically while connected.");
      } catch (error) {
        queued = false;
        if (!disposed) { setFailure(errorMessage(error)); setMessage("Changes are saved locally; cloud sync is incomplete."); }
      } finally {
        running = false;
        if (!disposed) setBusy(false);
        if (queued) { queued = false; void sync(); }
      }
    }
    function changed() { void sync(); }
    run.current = changed;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      connected = !!session;
      if (!disposed) setEmail(session?.user.email ?? null);
      // Run after the auth callback releases its internal session lock.
      if (connected) setTimeout(changed, 0);
      else if (!disposed) setMessage("Local changes stay in this browser until you connect an admin account.");
    });
    window.addEventListener("local-inventory-change", changed);
    window.addEventListener("online", changed);
    window.addEventListener("focus", changed);
    return () => {
      disposed = true; subscription.unsubscribe();
      window.removeEventListener("local-inventory-change", changed);
      window.removeEventListener("online", changed);
      window.removeEventListener("focus", changed);
    };
  }, [client]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true); setFailure("");
    try {
      const result = await client.auth.signInWithPassword({ email: String(form.get("email")).trim(), password: String(form.get("password")) });
      if (result.error) throw result.error;
      element.reset(); setOpen(false);
    } catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="local-sync-panel" aria-label="Supabase sync">
    <div><strong>{email ? `Supabase: ${email}` : "Connect Supabase"}</strong><p role="status">{message}</p></div>
    {failure && <p className="form-error" role="alert">{failure}</p>}
    {email ? <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => run.current()}>{busy ? "Syncing..." : "Sync now"}</button><button className="button secondary" disabled={busy} onClick={async () => { const result = await client!.auth.signOut(); if (result.error) setFailure(errorMessage(result.error)); }}>Disconnect</button></div>
      : <button className="button secondary" disabled={!client || busy} onClick={() => setOpen(!open)}>{open ? "Cancel" : "Sign in once to sync"}</button>}
    {open && !email && <form className="modal-form" onSubmit={signIn}>
      <label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <p className="muted">Use an existing Supabase admin account. Your session stays in this browser. Pending local edits will sync after sign-in.</p>
      <button className="button primary" disabled={busy}>Connect and sync</button>
    </form>}
  </section>;
}
