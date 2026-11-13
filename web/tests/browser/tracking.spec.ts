import { test, expect } from "@playwright/test";

test("tracking demo, map links, contact editing and isolated inventory", async ({ page }) => {
  const mobile = test.info().project.name === "mobile";
  if (!mobile) await page.setViewportSize({ width: 1512, height: 682 });
  const devices = Array.from({ length: 12 }, (_, index) => ({ id: `device-${index}`, name: index === 0 ? "Redmi A4 5G" : index === 1 ? "iPhone 16 Plus" : `Phone ${index + 1}`, model_name: "Test phone", platform: index === 1 ? "iOS" : "Android", allocation_team: index === 1 ? "Design" : "QA", serial_number: null, barcode: `EQ-${index + 1}`, holder_id: null, retired: false, availability_confirmed: true, version: 1 }));
  const user = { id: "admin", email: "admin@example.test" };
  const writes: string[] = [];
  await page.route("https://*.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/rest/") && route.request().method() !== "GET") writes.push(url.pathname);
    const body = url.pathname.includes("/token") ? { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user }
      : url.pathname.includes("/auth/v1/user") ? user
      : url.pathname.endsWith("dm_admins") ? { user_id: user.id }
      : url.pathname.endsWith("dm_devices") ? devices : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Track device", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Track device", exact: true })).toBeVisible();
  await expect(page.getByText("Sample locations, holders and contacts. Edits stay in this browser.")).toBeVisible();
  const detail = page.getByRole("region", { name: "Tracking details" });
  await expect(detail.getByRole("heading", { name: "Redmi A4 5G", exact: true })).toBeVisible();
  await expect(detail.getByText("Arshad", { exact: true })).toBeVisible();
  await expect(detail.getByRole("link", { name: /^Call Arshad/ })).toHaveAttribute("href", "tel:+12025550101");
  await expect(detail.getByRole("link", { name: /^Email Arshad/ })).toHaveAttribute("href", "mailto:arshad%40example.com");
  const google = detail.getByRole("link", { name: "Google Maps", exact: true });
  await expect(google).toHaveAttribute("target", "_blank");
  const googleUrl = new URL((await google.getAttribute("href"))!);
  expect(googleUrl.hostname).toBe("www.google.com");
  expect(googleUrl.searchParams.get("query")).toBe("12.9763,77.5929");
  const appleUrl = new URL((await detail.getByRole("link", { name: "Apple Maps", exact: true }).getAttribute("href"))!);
  expect(appleUrl.hostname).toBe("maps.apple.com");
  expect(appleUrl.searchParams.get("center")).toBe("12.9763,77.5929");
  await expect(detail.locator("iframe")).toHaveAttribute("src", /openstreetmap\.org\/export\/embed/);
  await expect(page.frameLocator('iframe[title="Demo location of Redmi A4 5G"]').locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.frames().find(frame => frame.url().includes("openstreetmap.org/export/embed"))!.waitForLoadState("networkidle", { timeout: 15000 });
  await expect(detail.getByText("Last app activity", { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/track-device-${test.info().project.name}.png`, fullPage: true });
  if (!mobile) {
    for (const size of [{ width: 1512, height: 682 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => detail.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    }
    await page.setViewportSize({ width: 1512, height: 682 });
    const seen = new Set<string>();
    do {
      for (const name of await page.locator(".tracking-device strong").allTextContents()) seen.add(name);
      if (await page.getByRole("button", { name: "Next devices", exact: true }).isDisabled()) break;
      await page.getByRole("button", { name: "Next devices", exact: true }).click();
    } while (seen.size < 12);
    expect(seen.size).toBe(12);
    while (await page.getByRole("button", { name: "Previous devices", exact: true }).isEnabled()) await page.getByRole("button", { name: "Previous devices", exact: true }).click();
  }
  await detail.getByRole("button", { name: "Location history", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Location history", exact: true });
  await expect(history.locator("li")).toHaveCount(4);
  await expect(history).toContainText("Demo");
  await page.keyboard.press("Escape");
  await expect(detail.getByRole("button", { name: "Location history", exact: true })).toBeFocused();
  const edit = detail.getByRole("button", { name: "Edit contact", exact: true });
  await edit.click();
  const contact = page.getByRole("dialog", { name: "Edit contact", exact: true });
  await contact.getByLabel("Contact number", { exact: true }).fill("123");
  await contact.getByRole("button", { name: "Save demo contact", exact: true }).click();
  await expect(contact.getByRole("alert")).toContainText("valid contact number");
  await contact.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toBeFocused();
  await expect(detail.getByRole("link", { name: /^Call Arshad/ })).toHaveAttribute("href", "tel:+12025550101");
  await edit.click();
  await contact.getByLabel("Contact number", { exact: true }).fill("+1 202 555 0110");
  await contact.getByLabel("Email", { exact: true }).fill("demo.changed@example.com");
  await contact.getByRole("button", { name: "Save demo contact", exact: true }).click();
  await expect(detail.getByRole("link", { name: /^Call Arshad/ })).toHaveAttribute("href", "tel:+12025550110");
  await expect(page.getByRole("status").filter({ hasText: "Contact saved in this browser only." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Track device", exact: true }).click();
  await expect(detail.getByRole("link", { name: /^Email Arshad/ })).toHaveAttribute("href", "mailto:demo.changed%40example.com");
  await page.getByRole("combobox", { name: "Tracking status", exact: true }).click();
  await page.getByRole("option", { name: "Permission off", exact: true }).click();
  await expect(detail.getByText("Location permission off", { exact: true })).toBeVisible();
  await expect(detail.locator("iframe")).toHaveCount(0);
  await expect(detail.getByRole("link", { name: "Google Maps", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Tracking status", exact: true }).click();
  await page.getByRole("option", { name: "Stale location", exact: true }).click();
  await expect(detail.locator(".tracking-status")).toHaveText("Stale location");
  await page.getByRole("combobox", { name: "Tracking team", exact: true }).click();
  await page.getByRole("option", { name: "Design", exact: true }).click();
  await expect(detail.getByRole("heading", { name: "iPhone 16 Plus", exact: true })).toBeVisible();
  await page.getByLabel("Search tracked devices").fill("not-a-device");
  await expect(page.getByText("No matching devices", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("button", { name: "Refresh demo", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo reports refreshed." })).toBeVisible();
  if (mobile) {
    await page.getByRole("combobox", { name: "Select tracked device", exact: true }).click();
    await page.getByRole("option", { name: "iPhone 16 Plus / EQ-2", exact: true }).click();
    await expect(detail.getByRole("heading", { name: "iPhone 16 Plus", exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.locator(".metric-card").filter({ hasText: "Assigned" }).locator("strong")).toHaveText("0");
  await expect(page.locator(".metric-card.total strong")).toHaveText("12");
  expect(writes).toEqual([]);
});
