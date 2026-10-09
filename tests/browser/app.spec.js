import { test, expect } from '@playwright/test'

for (const scenario of [
  { name: 'stopped API', status: 500, body: '', message: 'Start both services with npm run dev:all.' },
  { name: 'HTML proxy error', status: 502, body: '<html>Bad gateway</html>', message: 'The API returned an invalid response (HTTP 502).' },
  { name: 'expired Google session', status: 401, body: JSON.stringify({ error: 'Google session expired or invalid. Sign in again.' }), message: 'Google session expired or invalid. Sign in again.' },
]) {
  test(`login handles ${scenario.name} and clears the rejected session`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('oa_token', 'test-user'))
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: scenario.status, body: scenario.body }))
    await page.goto('/app')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('alert')).toContainText(scenario.message)
    expect(await page.evaluate(() => localStorage.getItem('oa_token'))).toBeNull()
  })
}

test('peer audit retry clears the earlier failure and preserves task output', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oa_token', 'test-user'))
  let auditAttempts = 0
  await page.route('**/api/tasks/*/audit', (route) => {
    auditAttempts++
    return auditAttempts === 1
      ? route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Peer reviewer unavailable. Retry the audit.' }) })
      : route.continue()
  })
  await page.goto('/app')
  await page.getByPlaceholder(/Describe a task for the swarm/).fill('Draft an audit recovery test plan')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Peer reviewer unavailable')
  await expect(page.getByText(/Test fixture deliverable:/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Trigger peer audit' }).click()
  await expect(page.getByText('Trust updated:')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(auditAttempts).toBe(2)
})

test('public landing, missing configuration, and protected routes', async ({ page }) => {
  await page.goto('/app')
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Google sign-in not configured').first()).toBeVisible()
  await expect(page.getByText('Illustrative interface preview — not live metrics')).toBeVisible()
})

test('marketplace, compare, profile, task + peer audit, swarm report and sign out', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  // The test server verifies this fixture identity. Production has no test login.
  await page.addInitScript(() => localStorage.setItem('oa_token', 'test-user'))
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Reputation Overview' })).toBeVisible()
  await page.getByRole('link', { name: 'Marketplace', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Agent Marketplace' })).toBeVisible()
  await page.getByTitle('Add to compare', { exact: true }).nth(0).click()
  await page.getByTitle('Add to compare', { exact: true }).nth(1).click()
  await page.getByRole('button', { name: 'Compare →' }).click()
  await expect(page.getByText('Trust score', { exact: true }).last()).toBeVisible()
  await page.keyboard.press('Escape')
  const search = page.getByPlaceholder('Search by name, role, capability…')
  await search.fill('Leo')
  await expect(page.getByText('Leo Tanaka', { exact: true })).toBeVisible()
  await page.getByText('Leo Tanaka', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Leo Tanaka', exact: true })).toBeVisible()
  await page.goto('/app')
  await page.getByPlaceholder('Describe a task for the swarm…').fill('Draft a release test plan')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByText('Test fixture peer review.').first()).toBeVisible()
  await expect(page.getByText('Trust updated:')).toBeVisible()
  await page.goto('/app/swarms')
  await page.getByPlaceholder('e.g. Evaluate our onboarding flow for drop-off risks and propose fixes…').fill('Plan a release')
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
  await expect(page.getByText('merged report', { exact: true })).toBeVisible()
  await page.goto('/app/audits')
  await expect(page.getByText('Test fixture peer review.').first()).toBeVisible()
  await page.getByTitle('Sign out').click()
  await expect(page).toHaveURL('/')
  expect(errors).toEqual([])
})

test('unavailable backend displays an error without synthetic agents', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oa_token', 'test-user'))
  await page.route('**/api/agents', (route) => route.abort())
  await page.goto('/app')
  await expect(page.getByRole('alert')).toContainText('Backend unavailable')
  await expect(page.getByText('Maya Chen', { exact: true })).toHaveCount(0)
})

test('Google token migrates to an HttpOnly session, survives refresh and logout revokes it', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('fixture-initialized')) {
      localStorage.setItem('oa_token', 'test-user')
      localStorage.setItem('fixture-initialized', 'true')
    }
  })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Reputation Overview' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('oa_token'))).toBeNull()
  const cookies = await page.context().cookies()
  expect(cookies.find((c) => c.name === 'oa_session')?.httpOnly).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Reputation Overview' })).toBeVisible()
  await page.getByTitle('Sign out').click()
  await expect(page).toHaveURL('/')
  await page.goto('/app')
  await expect(page).toHaveURL('/')
})

test('live runtime settings switch to OpenAI, persist, execute and expose task history', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oa_token', 'test-user'))
  await page.goto('/app/connections')
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('openai')
  await page.getByRole('button', { name: 'Save runtime settings' }).click()
  await expect(page.getByRole('status')).toContainText('Backend settings saved')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Provider', exact: true })).toHaveValue('openai')
  await page.getByRole('button', { name: 'Check live generation' }).click()
  await expect(page.getByRole('status')).toContainText('Live generation succeeded for openai')
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByPlaceholder(/Describe a task for the swarm/).fill('Draft a persisted OpenAI task')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByText('Trust updated:')).toBeVisible()
  await page.getByRole('link', { name: 'Task History', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Task history', exact: true })).toBeVisible()
  await expect(page.getByText('Draft a persisted OpenAI task', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View output' }).first().click()
  await expect(page.getByText(/Test fixture deliverable:/).first()).toBeVisible()
  await page.getByRole('link', { name: 'AI Models', exact: true }).click()
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('gemini')
  await page.getByRole('button', { name: 'Save runtime settings' }).click()
  await expect(page.getByRole('status')).toContainText('Backend settings saved')
})
