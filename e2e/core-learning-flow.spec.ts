import { test, expect } from '@playwright/test';

test.describe('LocalCloud Core Learning Flow & GCP Console Fidelity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app shell to hydrate
    await expect(page.locator('text=LocalCloud').first()).toBeVisible();
  });

  test('1. Shell branding, project selector and navigation flyout', async ({ page }) => {
    // Brand header
    await expect(page.locator('text=LocalCloud').first()).toBeVisible();
    await expect(page.locator('text=Local Emulator').first()).toBeVisible();

    // Project picker button
    const projectPill = page.locator('button[title="Select a project"]');
    await expect(projectPill).toBeVisible();
    await projectPill.click();

    // Project modal opens
    await expect(page.locator('text=Select a project').first()).toBeVisible();
    await expect(page.locator('text=optical-order-460008-i6').first()).toBeVisible();

    // Close with Escape key
    await page.keyboard.press('Escape');
    await expect(page.locator('text=Select a project')).not.toBeVisible();

    // Open Navigation Drawer via hamburger
    const hamburger = page.locator('button[aria-label="Toggle navigation drawer"]');
    await hamburger.click();
    await expect(page.locator('text=Google Cloud Platform').first()).toBeVisible();
    await expect(page.locator('text=Favourite Products').first()).toBeVisible();

    // Close drawer via Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('text=Google Cloud Platform')).not.toBeVisible();
  });

  test('2. Command Palette and global keyboard shortcuts', async ({ page }) => {
    // Press '/' to open command palette
    await page.keyboard.press('/');
    await expect(page.locator('input[placeholder*="Search resources"]').first()).toBeVisible();

    // Type query to filter
    await page.keyboard.type('Storage');
    await expect(page.locator('text=Cloud Storage').first()).toBeVisible();

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(page.locator('input[placeholder*="Search resources"]')).not.toBeVisible();
  });

  test('3. Learning Track Lab 5: Static Website on Cloud Storage', async ({ page }) => {
    // Open Learning Track via Hero button or Assistant
    const labTrackBtn = page.locator('button:has-text("Explore Labs")').first();
    await expect(labTrackBtn).toBeVisible();
    await labTrackBtn.click();

    // Verify Lab 5 is listed with GCS architecture concepts
    await expect(page.locator('text=Lab 5: Static Website on Cloud Storage').first()).toBeVisible();
    await expect(page.locator('text=Grant Storage Object Viewer to "allUsers"').first()).toBeVisible();

    // Launch Lab 5
    const launchLab5Btn = page.locator('button:has-text("Launch")').nth(4);
    await launchLab5Btn.click();

    // Verifies navigation to Cloud Storage view
    await expect(page.locator('h1:has-text("Cloud Storage")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Create bucket")').first()).toBeVisible();
  });

  test('4. Cloud Shell CLI interaction with gcloud & gsutil', async ({ page }) => {
    // Open Cloud Shell
    const shellBtn = page.locator('button[aria-label="Cloud Shell"]');
    await shellBtn.click();
    await expect(page.locator('text=Welcome to LocalCloud Shell').first()).toBeVisible();

    // Run gcloud projects list
    const terminalInput = page.locator('input[placeholder*="Type gcloud or gsutil command"]').first();
    await terminalInput.fill('gcloud projects list');
    await page.keyboard.press('Enter');

    await expect(page.locator('text=optical-order-460008-i6').first()).toBeVisible();

    // Run gsutil ls
    await terminalInput.fill('gsutil ls');
    await page.keyboard.press('Enter');
    await expect(page.locator('text=gs://').first()).toBeVisible();
  });

  test('5. Cloud Run serverless deployment and reverse proxy test', async ({ page }) => {
    // Navigate to Cloud Run via command palette
    await page.keyboard.press('/');
    await page.locator('input[placeholder*="Search resources"]').first().fill('Cloud Run');
    await page.locator('text=Cloud Run').first().click();

    await expect(page.locator('h1:has-text("Cloud Run")').first()).toBeVisible();

    // Click on hello-service
    await page.locator('text=hello-service').first().click();

    // Verify Reverse Proxy path is displayed
    await expect(page.locator('text=/api/run/hello-service/').first()).toBeVisible();

    // Send request via Test & Invoke panel
    const sendBtn = page.locator('button:has-text("Send")').first();
    await sendBtn.click();

    // Verify 200 OK response
    await expect(page.locator('text=200 OK').first()).toBeVisible();
  });

  test('6. Secret Manager credentials vault and eye reveal', async ({ page }) => {
    // Navigate to Secret Manager
    await page.keyboard.press('/');
    await page.locator('input[placeholder*="Search resources"]').first().fill('Secret Manager');
    await page.locator('text=Secret Manager').first().click();

    await expect(page.locator('h1:has-text("Secret Manager")').first()).toBeVisible();

    // Inspect database-credentials secret
    await page.locator('text=database-credentials').first().click();
    await expect(page.locator('text=Secret Versions').first()).toBeVisible();

    // Value should initially be masked with dots
    await expect(page.locator('text=••••••••').first()).toBeVisible();

    // Click eye button to reveal
    const revealBtn = page.locator('button[title="Reveal secret"]').first();
    await revealBtn.click();

    // Verifies secret is unmasked
    await expect(page.locator('text=postgres://').first()).toBeVisible();
  });

  test('7. BigQuery Studio SQL workspace query execution', async ({ page }) => {
    // Navigate to BigQuery
    await page.keyboard.press('/');
    await page.locator('input[placeholder*="Search resources"]').first().fill('BigQuery');
    await page.locator('text=BigQuery').first().click();

    await expect(page.locator('h1:has-text("BigQuery Studio")').first()).toBeVisible();

    // Run query
    const runQueryBtn = page.locator('button:has-text("Run")').first();
    await runQueryBtn.click();

    // Results table appears
    await expect(page.locator('text=Query Results').first()).toBeVisible();
    await expect(page.locator('text=Compute Engine').first()).toBeVisible();
  });
});
