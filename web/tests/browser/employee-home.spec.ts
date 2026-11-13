import { test, expect } from "@playwright/test";

test('home shows own devices in employee preview, registers and transfers', async ({ page }) => {
  const key = 'device-manager-local-inventory-v1';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your devices, in one place.' })).toBeVisible();
  await expect.poll(() => page.evaluate(key => !!localStorage.getItem(key), key)).toBe(true);
  await page.evaluate(key => {
    const value = JSON.parse(localStorage.getItem(key)!);
    value.members = [{ id: 'alice', name: 'Alice Example', team: 'QA', role: 'Tester' }, { id: 'bob', name: 'Bob Example', team: 'Mobile', role: 'Developer' }];
    value.devices[0].holder_id = 'alice'; value.devices[1].holder_id = 'bob';
    localStorage.setItem(key, JSON.stringify(value));
  }, key);
  await page.reload();
  await page.getByLabel('Preview as', { exact: true }).selectOption('alice');
  await expect(page.getByRole('heading', { name: 'Hello, Alice.' })).toBeVisible();
  await expect(page.locator('.home-device-card')).toHaveCount(1);
  await expect(page.locator('.home-device-card').first()).toContainText('Redmi A4 5G');
  await page.getByRole('button', { name: /Add a device.*Register a device you use/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Device name', { exact: true }).fill('Employee test phone');
  await dialog.getByLabel('Model', { exact: true }).fill('Pixel');
  await dialog.getByLabel('Platform', { exact: true }).selectOption('Android');
  await dialog.getByRole('button', { name: 'Register device', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const card = page.locator('.home-device-card').filter({ has: page.getByRole('heading', { name: 'Employee test phone', exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Transfer', exact: true }).click();
  await page.getByLabel('Transfer to', { exact: true }).selectOption('bob');
  await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Activity', exact: true })).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('heading', { name: 'Transferred from Alice Example to Bob Example', exact: true })).toBeVisible();
  await expect(page.getByText('Local coordinator', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.activity-entry time').first()).toContainText('IST');
  const recorded = await page.locator('.activity-entry time').first().getAttribute('datetime');
  expect(Number.isFinite(new Date(recorded!).getTime())).toBe(true);
  await page.getByLabel('Preview as', { exact: true }).selectOption('bob');
  await expect(card).toBeVisible();
  await expect(page.locator('.home-device-card')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `/private/tmp/employee-home-${test.info().project.name}.png`, fullPage: true });
});

test('transfer explains an empty recipient list and disables confirmation', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('device-manager-local-inventory-v1'))).toBe(true);
  await page.evaluate(() => {
    const key = 'device-manager-local-inventory-v1';
    const value = JSON.parse(localStorage.getItem(key)!);
    value.members = [{ id: 'solo', name: 'Only employee', team: 'QA', role: '' }];
    value.devices[0].holder_id = 'solo';
    localStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload();
  await page.getByLabel('Preview as', { exact: true }).selectOption('solo');
  await page.locator('.home-device-card').getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(page.getByText(/No other approved employees are available/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm transfer', exact: true })).toBeDisabled();
});
