import { expect, test } from "@playwright/test";

test.describe("homepage smoke", () => {
  test("loads and shows the expected heading", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Consumer Resolver/);
    const heading = page.getByRole("heading", { level: 1, name: "Consumer Resolver" });
    await expect(heading).toBeVisible();
  });

  test("responds with a successful status", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", service: "consumer-resolver" });
  });
});
