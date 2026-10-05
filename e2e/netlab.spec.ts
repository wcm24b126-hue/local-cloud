/**
 * End-to-end coverage for the networking lab.
 *
 * The lab is pure simulation: nothing here talks to a cloud API, a container
 * runtime, or a real shell. These tests drive the UI the way a learner would.
 */

import { expect, test } from '@playwright/test';

/**
 * Open a networking-lab page from the console navigation drawer.
 *
 * The drawer exposes "Networking lab" as a top-level product whose submenu is
 * revealed on hover, so hovering is required before the individual pages are
 * reachable.
 */
async function openLabPage(
  page: import('@playwright/test').Page,
  label: string
): Promise<void> {
  const drawerToggle = page.getByRole('button', { name: /menu|navigation/i }).first();
  if (await drawerToggle.isVisible().catch(() => false)) {
    await drawerToggle.click();
  }

  const labProduct = page.getByRole('button', { name: 'Networking lab', exact: true }).first();
  if (await labProduct.isVisible().catch(() => false)) {
    // Hovering reveals the submenu without navigating away or closing the drawer.
    await labProduct.hover();
  }

  await page.getByRole('button', { name: label, exact: true }).first().click();
}

/** Load the sample network from whichever lab page is showing. */
async function loadSample(page: import('@playwright/test').Page): Promise<void> {
  const button = page.getByRole('button', { name: /load sample network/i }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText(/sample network loaded/i).first()).toBeVisible();
}

/**
 * Assert lab resource counts using the overview stat cards.
 *
 * The cards are the only buttons containing a `tabular-nums` paragraph, which
 * keeps this distinct from the section tabs that share the same labels.
 */
async function expectCounts(
  page: import('@playwright/test').Page,
  expected: Record<string, number>
): Promise<void> {
  for (const [label, value] of Object.entries(expected)) {
    const card = page.locator('button:has(p.tabular-nums)').filter({ hasText: label }).first();
    await expect(card.locator('p.tabular-nums')).toHaveText(String(value));
  }
}

/**
 * Wait until the debounced auto-save has actually written the expected VPC count.
 *
 * The context saves 400ms after the last change, so a test that reloads sooner
 * would read stale storage.
 */
async function waitForPersistedVpcCount(
  page: import('@playwright/test').Page,
  count: number
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('localcloud_netlab_state_v1');
          if (!raw) return -1;
          return JSON.parse(raw)?.state?.vpcs?.length ?? -1;
        }),
      { timeout: 5000 }
    )
    .toBe(count);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Start every test from a clean lab so persistence cannot leak between runs.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('shows the simulation-only lab overview with a sample network', async ({ page }) => {
  await openLabPage(page, 'Lab overview');

  await expect(page.getByRole('heading', { name: /networking lab/i }).first()).toBeVisible();

  await loadSample(page);

  // One VPC, three subnetworks, three VM instances.
  await expectCounts(page, { 'VPC networks': 1, Subnetworks: 3, 'VM instances': 3 });
  // Seeding also raises a toast naming the VPC.
  await expect(page.getByText('demo-vpc').first()).toBeVisible();
});

test('lab state survives a page reload via localStorage', async ({ page }) => {
  await openLabPage(page, 'Lab overview');
  await loadSample(page);
  await expectCounts(page, { 'VPC networks': 1, Subnetworks: 3, 'VM instances': 3 });
  await waitForPersistedVpcCount(page, 1);

  await page.reload();

  // A reload restores from storage, with no reseeding and no "Load sample" click.
  await openLabPage(page, 'Lab overview');
  await expectCounts(page, { 'VPC networks': 1, Subnetworks: 3, 'VM instances': 3 });
  await expect(page.getByText('localStorage')).toBeVisible();
});

test('lists sample VMs with allocator-assigned internal IPs', async ({ page }) => {
  await openLabPage(page, 'Lab overview');
  await loadSample(page);

  await openLabPage(page, 'Lab VM instances');

  await expect(page.getByText('web-1').first()).toBeVisible();
  await expect(page.getByText('app-1').first()).toBeVisible();
  await expect(page.getByText('db-1').first()).toBeVisible();

  // First free address in each /24, not the gateway (.1) and not .10.
  await expect(page.getByText('10.0.1.2').first()).toBeVisible();
  await expect(page.getByText('10.0.2.2').first()).toBeVisible();
  await expect(page.getByText('10.0.3.2').first()).toBeVisible();
});

test('subnet page reports usable capacity excluding network and gateway', async ({ page }) => {
  await openLabPage(page, 'Lab overview');
  await loadSample(page);

  await openLabPage(page, 'Lab subnetworks');

  // 10.0.1.0/24 has 253 usable host addresses, and only web-1 has taken one.
  await expect(page.getByText(/1\s*\/\s*253/).first()).toBeVisible();
});

test('packet tracer shows an ALLOWED verdict for the web tier', async ({ page }) => {
  await openLabPage(page, 'Lab overview');
  await loadSample(page);

  await openLabPage(page, 'Lab packet tracer');

  await page.getByRole('button', { name: /internet .* load balancer/i }).first().click();
  await page.getByRole('button', { name: /^trace packet$/i }).first().click();

  await expect(page.getByText('ALLOWED').first()).toBeVisible();
});

test('packet tracer shows a BLOCKED verdict for internet SSH', async ({ page }) => {
  await openLabPage(page, 'Lab overview');
  await loadSample(page);

  await openLabPage(page, 'Lab packet tracer');

  await page.getByRole('button', { name: /internet .* port 22/i }).first().click();
  await page.getByRole('button', { name: /^trace packet$/i }).first().click();

  await expect(page.getByText('BLOCKED').first()).toBeVisible();
});

test('guided lab steps match the three-tier sample network', async ({ page }) => {
  await openLabPage(page, 'Guided lab');

  await expect(page.getByText(/three subnetworks, three VM instances/i).first()).toBeVisible();

  await loadSample(page);
  await expect(page.getByText(/10\.0\.1\.2, 10\.0\.2\.2, and 10\.0\.3\.2/).first()).toBeVisible();
});

test('topology page renders nodes for the seeded resources', async ({ page }) => {
  await openLabPage(page, 'Lab overview');
  await loadSample(page);

  await openLabPage(page, 'Lab topology');

  await expect(page.getByText(/network topology/i).first()).toBeVisible();
});

test('external navigation opens the requested lab page, not the overview', async ({ page }) => {
  await openLabPage(page, 'Lab routes');

  // Regression guard: the console drawer used to render the overview regardless
  // of which lab entry was chosen.
  await expect(page.getByRole('heading', { name: /^routes$/i }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /networking lab overview/i })).toHaveCount(0);
});

test('cloud shell runs simulated gcloud commands against lab state', async ({ page }) => {
  await openLabPage(page, 'Lab overview');
  await loadSample(page);

  const shellToggle = page.getByRole('button', { name: /cloud shell/i }).first();
  await expect(shellToggle).toBeVisible();
  await shellToggle.click();

  const input = page.getByRole('textbox').last();
  await input.fill('gcloud compute networks list');
  await input.press('Enter');

  await expect(page.getByText('demo-vpc').first()).toBeVisible();
});

test('cloud shell refuses real shell commands', async ({ page }) => {
  const shellToggle = page.getByRole('button', { name: /cloud shell/i }).first();
  await expect(shellToggle).toBeVisible();
  await shellToggle.click();

  const input = page.getByRole('textbox').last();
  await input.fill('gcloud compute ssh app-1 --zone us-central1-a');
  await input.press('Enter');

  // Simulated only: the terminal explains instead of shelling out.
  await expect(page.getByText(/simulation-only|no real shell|not available/i).first()).toBeVisible();
});

test('cascading VPC delete removes dependent resources', async ({ page }) => {
  await openLabPage(page, 'Lab overview');
  await loadSample(page);

  await openLabPage(page, 'Lab VPC networks');

  // The delete action lives in the details panel, which opens on row click.
  await page.getByRole('row').filter({ hasText: 'demo-vpc' }).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();

  const dialog = page.getByRole('dialog', { name: /this VPC still has resources/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /delete with dependencies/i }).click();

  // Subnets, VMs, disks, routes, the load balancer and policies all go with the VPC.
  await openLabPage(page, 'Lab VM instances');
  await expect(page.getByText('No VM instances yet')).toBeVisible();

  await openLabPage(page, 'Lab subnetworks');
  await expect(page.getByText('No subnetworks yet')).toBeVisible();

  await openLabPage(page, 'Lab VPC networks');
  await expect(page.getByText('No VPC networks yet')).toBeVisible();

  await openLabPage(page, 'Lab overview');
  await expectCounts(page, {
    'VPC networks': 0,
    Subnetworks: 0,
    'VM instances': 0,
    'Load balancers': 0,
    'Firewall policies': 0,
  });
});