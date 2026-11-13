import { test, expect } from "@playwright/test";

test("specifications edit, cancel, validation, failed save and persistence", async ({ page }) => {
  const mobile = test.info().project.name === "mobile";
  if (!mobile) await page.setViewportSize({ width: 1512, height: 682 });
  const device = {
    id: "device-specs", name: "Redmi A4 5G", model_name: "Redmi A4 5G", platform: "Android",
    allocation_team: "QA", serial_number: null, capacity: null, ram: "", barcode: "EQ-001",
    holder_id: null, retired: false, availability_confirmed: true, version: 1,
    updated_at: new Date().toISOString(), model_number: "", ios_version: "", wifi_address: "", bluetooth_address: ""
  };
  const user = { id: "admin", email: "admin@example.test" };
  let saves = 0;
  let failSpecifications = false;
  await page.route("https://*.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.includes("/token")) body = { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user };
    else if (url.pathname.includes("/auth/v1/user")) body = user;
    else if (url.pathname.endsWith("dm_admins")) body = { user_id: user.id };
    else if (url.pathname.endsWith("dm_devices")) {
      if (route.request().method() === "PATCH") {
        expect(url.searchParams.get("id")).toBe(`eq.${device.id}`);
        expect(url.searchParams.get("version")).toBe(`eq.${device.version}`);
        if (failSpecifications) {
          await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501" }) });
          return;
        }
        Object.assign(device, route.request().postDataJSON(), { version: device.version + 1 });
        saves++; body = device;
      } else body = [device];
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Redmi A4 5G EQ-001", exact: true }).click();
  const specs = page.getByRole("button", { name: "Device specifications", exact: true });
  await expect(specs.locator("svg.lucide-file-text")).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(specs).toHaveCSS("background-color", "rgb(246, 246, 247)");
  if (!mobile) {
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.getByRole("complementary", { name: "Selected device" })).toBeVisible();
    expect(await page.getByRole("complementary", { name: "Selected device" }).evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  }
  await page.screenshot({ path: `/tmp/specifications-opener-${test.info().project.name}.png` });
  await specs.click();
  const specsDialog = page.getByRole("dialog", { name: "Device specifications", exact: true });
  await expect(specsDialog).toContainText("Android");
  const editSpecs = specsDialog.getByRole("button", { name: "Edit", exact: true });
  await editSpecs.click();
  await expect(specsDialog.getByRole("combobox", { name: "Platform", exact: true })).toBeFocused();
  await specsDialog.getByLabel("RAM", { exact: true }).fill("8 GB");
  await specsDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editSpecs).toBeFocused();
  await expect(specsDialog.locator(".spec-list > div").filter({ hasText: "RAM" })).toContainText("Not recorded");
  expect(saves).toBe(0);
  await editSpecs.click();
  await specsDialog.getByLabel("RAM", { exact: true }).fill("8 GB");
  await specsDialog.getByLabel("Device name", { exact: true }).fill("");
  await specsDialog.getByRole("button", { name: "Save", exact: true }).click();
  expect(saves).toBe(0);
  await expect(specsDialog.getByLabel("Device name", { exact: true })).toBeFocused();
  await specsDialog.getByLabel("Device name", { exact: true }).fill("Redmi A4 5G");
  failSpecifications = true;
  await specsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(specsDialog.getByRole("alert")).toContainText("permission");
  await expect(specsDialog.getByLabel("RAM", { exact: true })).toHaveValue("8 GB");
  expect(saves).toBe(0);
  failSpecifications = false;
  await specsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editSpecs).toBeFocused();
  await expect(specsDialog.locator(".spec-list > div").filter({ hasText: "RAM" })).toContainText("8 GB");
  await editSpecs.click();
  await specsDialog.getByLabel("Capacity", { exact: true }).fill("128 GB");
  await specsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editSpecs).toBeFocused();
  await expect(specsDialog.locator(".spec-list > div").filter({ hasText: "Capacity" })).toContainText("128 GB");
  expect(saves).toBe(2);
  await page.screenshot({ path: `/tmp/device-specifications-${test.info().project.name}.png` });
  await specsDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(specs).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Redmi A4 5G EQ-001", exact: true }).click();
  await specs.click();
  await expect(specsDialog.locator(".spec-list > div").filter({ hasText: "RAM" })).toContainText("8 GB");
  await expect(specsDialog.locator(".spec-list > div").filter({ hasText: "Capacity" })).toContainText("128 GB");
  await editSpecs.click();
  await specsDialog.getByLabel("RAM", { exact: true }).fill("16 GB");
  await page.keyboard.press("Escape");
  await expect(editSpecs).toBeFocused();
  await expect(specsDialog.locator(".spec-list > div").filter({ hasText: "RAM" })).toContainText("8 GB");
  expect(saves).toBe(2);
  await page.keyboard.press("Escape");
  await expect(specs).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
