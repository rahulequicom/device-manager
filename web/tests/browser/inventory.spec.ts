import { test, expect } from "@playwright/test";

test("one inventory, team filtering, confirmation and saved edits", async ({ page }) => {
  if (test.info().project.name === "desktop") await page.setViewportSize({ width: 1512, height: 682 });
  const names = ["Redmi A4 5G", "iPhone 16 Plus", "Vivo Y31 5G", "Samsung A17 Galaxy", "iPhone 17 (green)", "OPPO A3x 5G", "Moto G 57 Power", "Google Pixel 10 a", "Galaxy S26 FE", "One Plus 15 R", "Realme 15x", "Samsung A17 Galaxy"];
  const devices = names.map((name, i) => ({ id: `device-${i}`, name, model_name: name, platform: i === 1 || i === 4 ? "iOS" : "Android", allocation_team: i === 2 ? "Mobile" : i === 3 || i === 4 ? "Design" : "QA", serial_number: null, capacity: null, barcode: `EQ-${String(i + 1).padStart(3, "0")}`, holder_id: null, retired: false, availability_confirmed: false, version: 1, updated_at: new Date().toISOString(), model_number: "", ios_version: "", wifi_address: "", bluetooth_address: "" }));
  const user = { id: "admin", email: "admin@example.test" };
  let saves = 0;
  let failOwnership = false;
  const members: { id: string; name: string; team: string; role: string }[] = [
    { id: "member-0", name: "First recipient", team: "QA", role: "" },
    { id: "member-1", name: "Second recipient", team: "Design", role: "" },
  ];
  const events: Record<string, unknown>[] = [{ id: "spec-edit", device_id: "device-0", device_name: "Redmi A4 5G", action: "Device details updated", actor: user.email, created_at: new Date().toISOString(), before_data: { holder_id: null }, after_data: { holder_id: null } }];
  events.push(...Array.from({ length: 7 }, (_, index) => ({ id: `older-${index}`, device_id: "device-0", device_name: "Redmi A4 5G", action: `Earlier device update ${index + 1}`, actor: user.email, created_at: new Date(Date.now() - (index + 1) * 86400000).toISOString(), before_data: { holder_id: null }, after_data: { holder_id: null } })));
  await page.route("https://*.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.includes("/token")) body = { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user };
    else if (url.pathname.includes("/auth/v1/user")) body = user;
    else if (url.pathname.endsWith("dm_admins")) body = { user_id: user.id };
    else if (url.pathname.endsWith("dm_members")) {
      if (route.request().method() === "POST") {
        const member = { ...route.request().postDataJSON(), id: `member-${members.length}` };
        members.push(member); body = member;
      } else body = members;
    }
    else if (url.pathname.endsWith("dm_audit_events")) body = events;
    else if (url.pathname.endsWith("dm_devices")) {
      if (route.request().method() === "PATCH") {
        const device = devices.find(row => `eq.${row.id}` === url.searchParams.get("id"))!;
        const changes = route.request().postDataJSON();
        if (failOwnership && changes.holder_id) { await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501" }) }); return; }
        expect(url.searchParams.get("version")).toBe(`eq.${device.version}`);
        if (changes.holder_id) events.unshift({ id: `event-${events.length}`, device_id: device.id, device_name: device.name, action: device.holder_id ? "Transferred to second recipient" : "Assigned to first recipient", actor: user.email, created_at: new Date().toISOString(), before_data: { holder_id: device.holder_id }, after_data: { holder_id: changes.holder_id } });
        Object.assign(device, changes, { version: device.version + 1 });
        saves++; body = device;
      } else body = devices;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const mobile = test.info().project.name === "mobile";
  const rows = page.locator(".inventory-panel .register-table tbody tr");
  await expect(page.locator(".metric-card.total strong")).toHaveText("12");
  if (mobile) await expect(rows).toHaveCount(12);
  else await expect.poll(() => rows.count()).toBeLessThan(12);
  const deviceList = page.locator(test.info().project.name === "mobile" ? ".mobile-device-list" : ".inventory-panel .register-table");
  const seen = new Set<string>();
  let appleCount = 0;
  let androidCount = 0;
  do {
    await expect.poll(() => deviceList.locator(".row-device-icon img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    for (const serial of await deviceList.locator("small").allTextContents()) seen.add(serial);
    appleCount += await deviceList.locator('img[src="/platforms/apple.svg"]').count();
    androidCount += await deviceList.locator('img[src="/platforms/android.svg"]').count();
    if (await page.getByRole("button", { name: "Next page", exact: true }).isDisabled()) break;
    await page.getByRole("button", { name: "Next page", exact: true }).click();
  } while (seen.size < 12);
  expect(seen.size).toBe(12);
  expect(appleCount).toBe(2);
  expect(androidCount).toBe(10);
  while (await page.getByRole("button", { name: "Previous page", exact: true }).isEnabled()) {
    await page.getByRole("button", { name: "Previous page", exact: true }).click();
  }
  await expect.poll(() => deviceList.locator(".row-device-icon img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.getByRole("button", { name: /^Ownership history for / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /real register|purchase list/i })).toHaveCount(0);
  await expect(page.locator(".metric-card")).toHaveCount(4);
  await expect(page.locator(".inventory-panel th").filter({ hasText: /Action|Platform/ })).toHaveCount(0);
  await expect(page.locator(".holder-strip, .history-switch, .device-tools")).toHaveCount(0);
  await expect(deviceList.locator(".ownership-action")).toHaveCount(0);
  if (test.info().project.name === "desktop") {
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    for (const height of [900, 600, 682]) {
      await page.setViewportSize({ width: 1512, height });
      await expect.poll(() => page.locator(".inventory-panel > .table-scroll").evaluate(element => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect.poll(() => page.getByRole("complementary", { name: "Selected device" }).evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    }
    const searchBounds = await page.locator(".filters > .search-field").boundingBox();
    expect(searchBounds).not.toBeNull();
    for (const name of ["Status", "Team", "Platform"]) {
      const filterBounds = await page.getByRole("combobox", { name, exact: true }).boundingBox();
      expect(filterBounds).not.toBeNull();
      expect(Math.abs(filterBounds!.y - searchBounds!.y)).toBeLessThan(3);
      expect(filterBounds!.x).toBeGreaterThan(searchBounds!.x + searchBounds!.width);
    }
    await expect(page.getByRole("complementary", { name: "Selected device" })).toContainText("Redmi A4 5G");
    await page.getByRole("row").filter({ hasText: "iPhone 16 Plus" }).getByText("QA", { exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Selected device" })).toContainText("iPhone 16 Plus");
  } else {
    await expect(page.getByRole("dialog", { name: "Device details", exact: true })).toHaveCount(0);
  }
  const statusMenu = page.getByRole("combobox", { name: "Status", exact: true });
  await statusMenu.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(statusMenu).toBeFocused();
  await expect(page.locator(".workspace-bar, .workspace-status, .workspace-footer, .page-description")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review devices", exact: true })).toHaveCount(0);
  await expect(page.locator(".metric-card.total small")).toHaveText("12 not confirmed");
  await expect(page.locator(".filter-summary")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Team", exact: true }).click();
  await page.screenshot({ path: `/tmp/in-app-dropdown-${test.info().project.name}.png` });
  await page.getByRole("option", { name: "QA", exact: true }).click();
  if (mobile) await expect(rows).toHaveCount(9);
  else await expect.poll(() => rows.count()).toBeLessThan(9);
  await expect(page.getByRole("status").filter({ hasText: "9 of 12 devices" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.screenshot({ path: `/tmp/unified-inventory-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Redmi A4 5G EQ-001", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Selected device" }).getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.getByText("Device details updated", { exact: true })).toBeVisible();
  const specs = page.getByRole("button", { name: "Device specifications", exact: true });
  await specs.click();
  const specsDialog = page.getByRole("dialog", { name: "Device specifications", exact: true });
  await expect(specsDialog).toContainText("Android");
  await specsDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(specs).toBeFocused();
  const fullHistory = page.getByRole("button", { name: /^View all/ });
  await fullHistory.click();
  const historyDialog = page.getByRole("dialog", { name: "Device history", exact: true });
  await expect(historyDialog).toContainText("Device details updated");
  await expect(historyDialog.locator(".event")).toHaveCount(8);
  await historyDialog.getByText("Earlier device update 7", { exact: true }).scrollIntoViewIfNeeded();
  await expect(historyDialog.getByText("Earlier device update 7", { exact: true })).toBeInViewport();
  await historyDialog.getByRole("button", { name: "Close", exact: true }).focus();
  await expect(historyDialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(fullHistory).toBeFocused();
  await expect(page.getByRole("button", { name: "Return", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "More device actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Confirm available", exact: true }).click();
  await expect(page.locator(".inventory-panel .register-table tr").filter({ hasText: "Redmi A4 5G" }).locator(".status-pill")).toHaveText("Available");
  await expect(page.locator(".metric-card.total small")).toHaveText("11 not confirmed");
  await page.getByRole("button", { name: "More device actions", exact: true }).click();
  const retire = page.getByRole("menuitem", { name: "Retire", exact: true });
  await expect(retire).toHaveCSS("color", "rgb(180, 35, 24)");
  await page.screenshot({ path: `/tmp/retire-action-${test.info().project.name}.png` });
  await retire.click();
  await page.getByRole("button", { name: "More device actions", exact: true }).click();
  const restore = page.getByRole("menuitem", { name: "Restore", exact: true });
  await expect(restore).toBeEnabled();
  await expect(restore).not.toHaveClass(/destructive/);
  await expect(page.locator(".inventory-panel .register-table tr").filter({ hasText: "Redmi A4 5G" }).locator(".status-pill")).toHaveText("Retiring");
  await restore.click();
  await expect(page.getByRole("button", { name: "Assign device", exact: true })).toBeEnabled();
  await expect(page.locator(".inventory-panel .register-table tr").filter({ hasText: "Redmi A4 5G" }).locator(".status-pill")).toHaveText("Available");
  await page.getByRole("button", { name: "More device actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit details", exact: true }).click();
  await page.getByRole("dialog", { name: "Edit device", exact: true }).getByLabel("Device name", { exact: true }).fill("Redmi QA phone");
  await page.getByRole("dialog", { name: "Edit device", exact: true }).getByRole("combobox", { name: "Device team", exact: true }).click();
  await page.getByRole("option", { name: "Not recorded", exact: true }).click();
  expect(await page.getByRole("dialog", { name: "Edit device", exact: true }).locator('input[name="allocation_team"]').inputValue()).toBe("");
  await page.getByRole("dialog", { name: "Edit device", exact: true }).getByRole("combobox", { name: "Device team", exact: true }).click();
  await page.getByRole("option", { name: "QA", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit device", exact: true })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Redmi QA phone EQ-001", exact: true })).toBeVisible();
  expect(saves).toBe(4);
  await page.getByRole("button", { name: "Redmi QA phone EQ-001", exact: true }).click();
  await page.getByRole("complementary", { name: "Selected device" }).getByRole("button", { name: "Assign device", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^(Assign|Transfer) device$/ });
  await dialog.getByLabel("Assign to", { exact: true }).fill("First recipient");
  await dialog.getByRole("option", { name: /First recipient/ }).click();
  await dialog.getByRole("button", { name: "Assign device", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".metric-card").filter({ hasText: "Assigned" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".metric-card").filter({ hasText: "Available" }).locator("strong")).toHaveText("0");
  await expect(page.getByRole("button", { name: "Return", exact: true })).toBeVisible();
  await expect(page.getByText("Assigned to first recipient", { exact: true })).toBeVisible();
  await page.getByRole("complementary", { name: "Selected device" }).getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Recipient", exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Transfer direction")).toContainText(/From[\s\S]*First recipient[\s\S]*To[\s\S]*Choose a person/);
  await dialog.getByLabel("Transfer to", { exact: true }).fill("Second recipient");
  await dialog.getByRole("option", { name: /Second recipient/ }).click();
  failOwnership = true;
  await dialog.getByRole("button", { name: "Confirm transfer", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("permission");
  expect(devices[0].holder_id).toBe("member-0");
  failOwnership = false;
  await dialog.getByRole("button", { name: "Confirm transfer", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(members).toHaveLength(2);
  await expect(page.locator(".metric-card").filter({ hasText: "Assigned" }).locator("strong")).toHaveText("1");
  await expect(page.getByText("Transferred to second recipient", { exact: true })).toBeVisible();
  await page.reload();
  const registerItem = test.info().project.name === "mobile"
    ? page.getByRole("article").filter({ hasText: "Redmi QA phone" })
    : page.getByRole("row").filter({ hasText: "Redmi QA phone" });
  await expect(registerItem).toContainText("Second recipient");
  await expect(registerItem).toContainText("QA");
  await registerItem.getByRole("button", { name: "Redmi QA phone EQ-001", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Selected device" }).getByRole("button", { name: "Transfer", exact: true })).toBeEnabled();
  await page.screenshot({ path: `/tmp/device-details-${test.info().project.name}.png`, fullPage: true });
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "Back to devices", exact: true }).click();
    await expect(registerItem.getByRole("button", { name: "Redmi QA phone EQ-001", exact: true })).toBeFocused();
  }
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "First recipient" }).locator("td").last()).toHaveText("0");
  await expect(page.getByRole("row").filter({ hasText: "Second recipient" }).locator("td").last()).toHaveText("1");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.screenshot({ path: `/tmp/assignment-inventory-${test.info().project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
