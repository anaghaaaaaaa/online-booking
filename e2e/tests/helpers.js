import { expect } from '@playwright/test';

export const SITE = 'http://localhost:8100';
export const API = process.env.EVENTEASE_API_URL || 'http://localhost:5100/api/v1';

export async function makeContext(browser, storageState) {
  const context = await browser.newContext(storageState ? { storageState } : {});
  await context.route('https://**/*', (route) => route.abort());
  await context.addInitScript((apiUrl) => {
    window.EVENTEASE_API_URL = apiUrl;
    window.__eventEasePrintCalls = 0;
    window.print = () => { window.__eventEasePrintCalls += 1; };
  }, API);
  return context;
}

export async function login(page, email, password) {
  await page.goto(`${SITE}/login.html`);
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.locator('#loginForm button[type="submit"]').click();
}

export async function registerThroughApi(request, email, name, password) {
  const response = await request.post(`${API}/auth/register`, {
    data: { name, email, password }
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data.user;
}

export async function eventFromApi(page, id) {
  return page.evaluate(async ({ api, eventId }) => {
    const response = await fetch(`${api}/events/${eventId}`);
    return { status: response.status, body: await response.json() };
  }, { api: API, eventId: id });
}

export async function measureLayout(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const textOverflow = [...document.querySelectorAll('h1,h2,h3,p,a,button,strong')]
      .filter(visible)
      .filter((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2)
      .map((element) => element.textContent.trim().slice(0, 60));
    return {
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > width + 1,
      textOverflow
    };
  });
}
