import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmployeeSignupClient, getSupabase, requireDirectSignup } from "./supabase";
import { newPasswordError } from "./password-policy";
import type { Team } from "./device-data";
export type EmployeeLoginInput = { name: string; email: string; password: string; team: Team; role: string; memberId?: string };

export async function provisionEmployeeLogin(admin: SupabaseClient, signup: SupabaseClient, input: EmployeeLoginInput) {
  const invalid = newPasswordError(input.password, input.password);
  if (invalid) throw new Error(invalid);
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@equicomtech\.com$/.test(email)) throw new Error("Enter an @equicomtech.com work email.");
  const prepared = await admin.rpc("dm_prepare_employee_login", { p_email: email, p_name: input.name.trim(), p_team: input.team, p_role: input.role.trim(), p_member_id: input.memberId ?? null });
  if (prepared.error) throw prepared.error;
  if (typeof prepared.data !== "string" || !/^[0-9a-f-]{36}$/i.test(prepared.data)) throw new Error("Could not prepare the employee login. Try again.");
  const created = await signup.auth.signUp({ email, password: input.password, options: { data: { dm_employee_login_token: prepared.data } } });
  if (created.error) throw created.error;
  if (!created.data.user || created.data.user.identities?.length === 0) throw new Error("That email already has a login. Its password was not changed.");
  if (!created.data.session) throw new Error("The login was created, but Supabase still requires email confirmation. Ask the project owner to turn Confirm email off.");
  return { email, userId: created.data.user.id };
}
export async function createEmployeeLogin(input: EmployeeLoginInput) {
  const admin = getSupabase();
  if (!admin) throw new Error("Supabase is not configured.");
  await requireDirectSignup();
  const signup = createEmployeeSignupClient();
  try { return await provisionEmployeeLogin(admin, signup, input); }
  finally {
    // Revoke the disposable employee session; never touch the admin's session.
    await signup.auth.signOut({ scope: "local" }).catch(() => {});
    await signup.auth.dispose();
  }
}

export async function setPersonState(memberId: string, action: "activate" | "deactivate" | "delete" | "restore") {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  const { error } = await client.rpc("dm_admin_set_person_state", { p_member_id: memberId, p_action: action });
  if (error) throw error;
}

export type EmployeeAccess = { member_id: string; is_admin: boolean; is_self: boolean };
export async function setEmployeeAdmin(memberId: string, granted: boolean) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured.");
  const { error } = await client.rpc("dm_admin_set_employee_admin", { p_member_id: memberId, p_granted: granted });
  if (error) throw error;
}
