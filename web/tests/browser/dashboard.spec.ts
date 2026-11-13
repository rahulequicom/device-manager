import { test, expect } from "@playwright/test";

// API fixtures isolate UI behavior. Live project verification remains separate.
test("sign-in, empty inventory, persistence requests, errors, and accessible dialogs", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const devices: Record<string, unknown>[] = [];
  let rejectSave = false;
  await page.route("https://*.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    let body: unknown = [];
    let status = 200;
    if (url.pathname.includes("/auth/v1/token")) body = { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user };
    else if (url.pathname.includes("/auth/v1/user")) body = user;
    else if (url.pathname.endsWith("dm_admins")) body = { user_id: user.id };
    else if (url.pathname.endsWith("dm_devices")) {
      if (method === "PATCH") {
        if (rejectSave) { status = 409; body = { code: "23505", message: "duplicate serial" }; }
        else { const record = { ...route.request().postDataJSON(), id: "test-device", updated_at: new Date().toISOString(), version: 1, holder_id: null, retired: false }; devices.push(record); body = record; }
      } else body = devices;
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("No devices registered yet")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `/tmp/device-admin-empty-${test.info().project.name}.png`, fullPage: true });
  await expect(page.getByRole("button", { name: /Add device|Add first device|Register phone|Register a device/ })).toHaveCount(0);
  devices.push({ id: "test-device", name: "Test iPhone", model_name: "iPhone 16", serial_number: "TEST-001", capacity: "128 GB", platform: "iOS", version: 1, holder_id: null, retired: false });
  await page.getByRole("button", { name: "Refresh register" }).click();
  await page.getByRole("button", { name: "Test iPhone TEST-001" }).click();
  await expect(page.getByRole("button", { name: "Assign device", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Add device", exact: true })).toHaveCount(0);
  rejectSave = true;
  await page.getByRole("button", { name: "More device actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit device", exact: true });
  await dialog.getByLabel("Device name", { exact: true }).fill("Duplicate");
  await dialog.getByRole("combobox", { name: "Platform", exact: true }).click();
  await page.getByRole("option", { name: "iOS", exact: true }).click();
  await dialog.getByLabel("Model", { exact: true }).fill("iPhone");
  await dialog.getByLabel("Serial number", { exact: true }).fill("TEST-001");
  await dialog.getByLabel("Capacity", { exact: true }).fill("128 GB");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("already registered");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  if (test.info().project.name === "mobile") await page.getByRole("button", { name: "Back to devices", exact: true }).click();
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.getByText("No people added yet")).toBeVisible();
  await page.getByRole("button", { name: "Device history", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Device history", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "All device activity", exact: true })).toBeVisible();
  await expect(page.getByText("No recorded activity yet.")).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/device-admin-${test.info().project.name}.png`, fullPage: true });
});

test("non-admin accounts cannot open the register", async ({ page }) => {
  await page.route("https://*.supabase.co/**", async route => {
    const url = route.request().url();
    const body = url.includes("/token") ? { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user: { id: "other", email: "other@example.test" } } : null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("other@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add device" })).toHaveCount(0);
});
