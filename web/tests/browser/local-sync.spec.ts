import { test, expect } from "@playwright/test";
import seed from "../../src/lib/local-seed.json";

test("local edits sync after one sign-in and retain the session on reload", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  let remote = { ...seed[0], model_number: "", ios_version: "", wifi_address: "", bluetooth_address: "", holder_id: null, retired: false, version: 7 };
  const patches: Record<string, unknown>[] = [];
  await page.route("https://*.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.includes("/auth/v1/token")) body = { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user };
    else if (url.pathname.includes("/auth/v1/user")) body = user;
    else if (url.pathname.endsWith("dm_admins")) body = { user_id: user.id };
    else if (url.pathname.endsWith("dm_devices")) {
      if (route.request().method() === "PATCH") {
        const patch = route.request().postDataJSON(); patches.push(patch);
        expect(url.searchParams.get("version")).toBe(`eq.${remote.version}`);
        remote = { ...remote, ...patch, version: remote.version + 1 }; body = { id: remote.id };
      } else body = remote;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  async function edit(name: string) {
    await page.evaluate(name => {
      const key = 'device-manager-local-inventory-v1';
      const value = JSON.parse(localStorage.getItem(key)!);
      const before = { ...value.devices[0] };
      value.devices[0].name = name; value.devices[0].version++;
      value.audit.unshift({ id: crypto.randomUUID(), device_id: before.id, device_name: name, action: 'Updated', actor: 'Local coordinator', created_at: new Date().toISOString(), before_data: before, after_data: value.devices[0] });
      localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event('local-inventory-change'));
    }, name);
  }
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Device inventory", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('device-manager-local-inventory-v1'))).toBe(true);
  await edit('Locally renamed phone');
  await page.getByRole("button", { name: "Sign in once to sync" }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Connect and sync" }).click();
  const success = page.getByText("Local changes saved to Supabase. New edits sync automatically while connected.");
  await expect(success).toBeVisible();
  expect(patches).toEqual([{ name: 'Locally renamed phone' }]);
  await page.reload();
  await expect(page.getByText(`Supabase: ${user.email}`, { exact: true })).toBeVisible();
  await expect(success).toBeVisible(); expect(patches).toHaveLength(1);
  await edit('Second local edit');
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toEqual({ name: 'Second local edit' });
  await expect(success).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in once to sync' })).toBeVisible();
});
