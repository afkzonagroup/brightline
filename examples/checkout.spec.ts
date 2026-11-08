import { expect as baseExpect, test } from '@playwright/test';
import { brightlineMatchers, scanPage } from '@afkzona/brightline/playwright';

const expect = baseExpect.extend(brightlineMatchers);

test('product page has no manipulative design', async ({ page }) => {
  await page.goto('/plain.html');
  await expect(page).toHaveNoBrightlineFindings({ minConfidence: 'medium' });
});

test('pre-ticked insurance is reported', async ({ page }) => {
  await page.goto('/preticked.html');
  const findings = await scanPage(page, { detectors: ['preselected-option'] });
  expect(findings.map((f) => f.provisions[0])).toContain('crd-art-22');
});
