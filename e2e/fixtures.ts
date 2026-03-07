import { test as base, expect, type Page } from '@playwright/test';

type Fixtures = {
  createPlayerPage: (handle: string) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  createPlayerPage: async ({ browser, baseURL }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];

    const factory = async (handle: string) => {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(baseURL!);
      await page.getByPlaceholder('Your name').fill(handle);
      await page.getByPlaceholder('Game password').fill('test');
      await page.getByRole('button', { name: 'Join' }).click();
      await page.getByTestId('waiting-room').waitFor();
      return page;
    };

    await use(factory);

    for (const ctx of contexts) {
      await ctx.close();
    }
  },
});
