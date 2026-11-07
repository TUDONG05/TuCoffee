import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixtureImage =
  '../backend/src/main/resources/catalog/images/c5a125e5-efc3-5ce5-9bbb-3475786da385.png';
const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function csrf(request: APIRequestContext) {
  expect((await request.get('/api/v1/auth/csrf')).ok()).toBe(true);
  const cookie = (await request.storageState()).cookies.find((item) => item.name === 'XSRF-TOKEN');
  expect(cookie).toBeDefined();
  return { 'X-XSRF-TOKEN': decodeURIComponent(cookie!.value) };
}

async function adminHeaders(request: APIRequestContext) {
  const login = await request.post('/api/v1/auth/login', {
    headers: await csrf(request),
    data: { email: process.env['E2E_ADMIN_EMAIL'], password: process.env['E2E_ADMIN_PASSWORD'] },
  });
  expect(login.ok()).toBe(true);
  const { accessToken } = await login.json();
  return { ...(await csrf(request)), Authorization: `Bearer ${accessToken}` };
}

test('public catalog searches and opens persisted products', async ({ page }) => {
  await expect
    .poll(
      async () => {
        const response = await page.request.get('/api/v1/products?size=10');
        return response.ok() ? (await response.json()).totalItems : 0;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await page.goto('/menu');
  const first = page.locator('.product-card').first();
  await expect(first).toBeVisible();
  const name = await first.locator('h2').innerText();
  await page.getByLabel('Tìm món', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page.locator('.product-card').first().locator('h2')).toHaveText(name);
  await page.locator('.product-card').first().click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const image = page.locator('.detail-grid img');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
});

test('isolated admin can create and edit catalog records reflected in the storefront', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = process.env['E2E_ADMIN_EMAIL'];
  const password = process.env['E2E_ADMIN_PASSWORD'];
  test.skip(
    !process.env['E2E_API_TARGET'] || !email || !password,
    'Requires an isolated API target and explicitly bootstrapped test admin.',
  );
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const categoryName = `Danh mục E2E ${id}`;
  const productName = `Sản phẩm E2E ${id}`;
  await page.goto('/login?returnUrl=%2Fadmin%2Fcategories');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email!);
  await page.getByLabel(/^Mật khẩu\s*\*?$/).fill(password!);
  await page.locator('main').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/categories$/);
  await page.getByRole('button', { name: 'Thêm danh mục', exact: true }).click();
  const dialog = page.locator('.ant-modal:visible');
  await dialog.getByLabel('Tên danh mục', { exact: true }).fill(categoryName);
  await dialog.getByLabel('Đường dẫn danh mục', { exact: true }).fill(`e2e-${id}`);
  await dialog.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const category = page.getByRole('row').filter({ hasText: categoryName });
  await category.getByRole('button', { name: `Sửa ${categoryName}`, exact: true }).click();
  await dialog.getByLabel('Đường dẫn danh mục', { exact: true }).fill(`edited-e2e-${id}`);
  await dialog.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(category).toContainText(`edited-e2e-${id}`);
  await page
    .locator('.admin-sidebar')
    .getByRole('link', { name: 'Quản lý sản phẩm', exact: true })
    .click();
  await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
  await dialog.getByLabel('Tên sản phẩm', { exact: true }).fill(productName);
  await dialog.getByLabel('Danh mục sản phẩm', { exact: true }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(categoryName, { exact: true })
    .click();
  await dialog.getByLabel('Giá bán (VND)', { exact: true }).fill('42000');
  await dialog.getByLabel('Mô tả', { exact: true }).fill('Sản phẩm kiểm thử trên schema riêng.');
  await dialog.getByRole('button', { name: 'Lưu sản phẩm', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Tên hoặc mô tả', { exact: true }).fill(productName);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  const product = page.getByRole('row').filter({ hasText: productName });
  await expect(product).toHaveCount(1);
  await expect(product).toContainText('42.000');
  await product.getByRole('button', { name: `Sửa ${productName}`, exact: true }).click();
  await dialog.getByLabel('Giá bán (VND)', { exact: true }).fill('45000');
  await dialog.getByRole('button', { name: 'Lưu sản phẩm', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(product).toContainText('45.000');
  await product.getByRole('button', { name: `Đổi ảnh ${productName}`, exact: true }).click();
  await dialog.getByLabel('Ảnh sản phẩm', { exact: true }).setInputFiles(fixtureImage);
  await dialog.getByRole('button', { name: 'Lưu ảnh', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto('/menu');
  await page.getByLabel('Tìm món', { exact: true }).fill(productName);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('45.000');
  await page.locator('.product-card').click();
  await expect(page).toHaveURL(/\/products\/\d+$/);
  const detailUrl = page.url();
  await expect
    .poll(() =>
      page.locator('.detail-grid img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.reload();
  await expect
    .poll(() =>
      page.locator('.detail-grid img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);

  await page.goto('/admin/products');
  await page.getByLabel('Tên hoặc mô tả', { exact: true }).fill(productName);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await product.getByRole('button', { name: `Ngừng bán ${productName}`, exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(
    product.getByRole('button', { name: `Bật bán ${productName}`, exact: true }),
  ).toBeVisible();
  expect(
    (await page.request.get(detailUrl.replace('/products/', '/api/v1/products/'))).status(),
  ).toBe(404);
  await page.goto('/menu');
  await page.getByLabel('Tìm món', { exact: true }).fill(productName);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(0);
});

test('catalog mutations reject anonymous and customer HTTP requests', async ({ request }) => {
  test.skip(!process.env['E2E_API_TARGET'], 'Requires an isolated API target.');
  const attemptWrites = async (headers: Record<string, string>, status: number) => {
    for (const [path, data] of [
      ['/api/v1/admin/categories', { name: 'Forbidden', slug: `forbidden-${uniqueId()}` }],
      ['/api/v1/admin/products', { name: 'Forbidden', categoryId: 1, priceVnd: 1000 }],
    ] as const) {
      expect(
        (
          await request.post(path, { headers: { ...headers, ...(await csrf(request)) }, data })
        ).status(),
      ).toBe(status);
    }
    expect(
      (
        await request.put('/api/v1/admin/products/1', {
          headers: { ...headers, ...(await csrf(request)) },
          data: { version: 0 },
        })
      ).status(),
    ).toBe(status);
    expect(
      (
        await request.patch('/api/v1/admin/categories/1/active', {
          headers: { ...headers, ...(await csrf(request)) },
          data: { active: false, version: 0 },
        })
      ).status(),
    ).toBe(status);
    expect(
      (
        await request.post('/api/v1/admin/products/1/image?version=0', {
          headers: { ...headers, ...(await csrf(request)) },
          multipart: {
            file: { name: 'image.png', mimeType: 'image/png', buffer: readFileSync(fixtureImage) },
          },
        })
      ).status(),
    ).toBe(status);
  };
  await attemptWrites(await csrf(request), 401);
  const account = {
    email: `catalog-${uniqueId()}@example.test`,
    password: 'Catalog-password-2026',
  };
  expect(
    (
      await request.post('/api/v1/auth/register', {
        headers: await csrf(request),
        data: { ...account, name: 'Khách kiểm thử catalog' },
      })
    ).status(),
  ).toBe(201);
  const login = await request.post('/api/v1/auth/login', {
    headers: await csrf(request),
    data: account,
  });
  expect(login.ok()).toBe(true);
  await attemptWrites(
    { ...(await csrf(request)), Authorization: `Bearer ${(await login.json()).accessToken}` },
    403,
  );
});

test('catalog HTTP validates data, pagination, image content and category visibility', async ({
  request,
}) => {
  test.skip(
    !process.env['E2E_API_TARGET'] ||
      !process.env['E2E_ADMIN_EMAIL'] ||
      !process.env['E2E_ADMIN_PASSWORD'],
    'Requires isolated admin fixtures.',
  );
  const headers = await adminHeaders(request);
  const categoryResponse = await request.post('/api/v1/admin/categories', {
    headers,
    data: { name: 'Kiểm thử HTTP', slug: `http-${uniqueId()}` },
  });
  expect(categoryResponse.status()).toBe(201);
  const category = await categoryResponse.json();
  for (const invalid of [
    { name: '', categoryId: category.id, priceVnd: 1000 },
    { name: 'Invalid', categoryId: category.id, priceVnd: -1 },
    { name: 'Invalid', categoryId: category.id, priceVnd: 1.5 },
  ]) {
    const response = await request.post('/api/v1/admin/products', {
      headers: { ...headers, ...(await csrf(request)) },
      data: invalid,
    });
    expect(response.status(), await response.text()).toBe(400);
    expect(response.headers()['content-type']).toContain('application/problem+json');
  }
  expect(
    (
      await request.post('/api/v1/admin/products', {
        headers: { ...headers, ...(await csrf(request)) },
        data: { name: 'Missing category', categoryId: 999999999, priceVnd: 1000 },
      })
    ).status(),
  ).toBe(404);
  const prefix = `HTTP ${uniqueId()} %_!`;
  const products = [];
  for (const priceVnd of [1000, 2000, 3000]) {
    const response = await request.post('/api/v1/admin/products', {
      headers: { ...headers, ...(await csrf(request)) },
      data: { name: `${prefix} ${priceVnd}`, categoryId: category.id, priceVnd },
    });
    expect(response.status()).toBe(201);
    products.push(await response.json());
  }
  const query = `q=${encodeURIComponent(prefix)}&categoryId=${category.id}&size=2&sort=priceDesc`;
  const first = await (await request.get(`/api/v1/products?${query}&page=0`)).json();
  const second = await (await request.get(`/api/v1/products?${query}&page=1`)).json();
  expect(first.totalItems).toBe(3);
  expect(first.totalPages).toBe(2);
  expect(first.items.map((item: { priceVnd: number }) => item.priceVnd)).toEqual([3000, 2000]);
  expect(second.items.map((item: { priceVnd: number }) => item.priceVnd)).toEqual([1000]);
  expect((await request.get('/api/v1/products?size=101')).status()).toBe(400);
  const product = products[0];
  for (const file of [
    {
      name: 'fake.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
  ]) {
    const response = await request.post(
      `/api/v1/admin/products/${product.id}/image?version=${product.version}`,
      { headers: { ...headers, ...(await csrf(request)) }, multipart: { file } },
    );
    expect(response.status()).toBe(file.name === 'large.png' ? 413 : 415);
  }
  const upload = await request.post(
    `/api/v1/admin/products/${product.id}/image?version=${product.version}`,
    {
      headers: { ...headers, ...(await csrf(request)) },
      multipart: {
        file: {
          name: '../../safe.png',
          mimeType: 'text/plain',
          buffer: readFileSync(fixtureImage),
        },
      },
    },
  );
  expect(upload.ok()).toBe(true);
  const uploaded = await upload.json();
  expect(uploaded.imageUrl).toMatch(/^\/api\/v1\/catalog\/images\/[a-f0-9-]+\.png$/);
  expect((await request.get(uploaded.imageUrl)).status()).toBe(200);
  const deactivate = await request.patch(`/api/v1/admin/categories/${category.id}/active`, {
    headers: { ...headers, ...(await csrf(request)) },
    data: { active: false, version: category.version },
  });
  expect(deactivate.ok()).toBe(true);
  expect((await (await request.get(`/api/v1/products?${query}`)).json()).totalItems).toBe(0);
  expect((await request.get(`/api/v1/products/${product.id}`)).status()).toBe(404);
  const inactiveCategory = await deactivate.json();
  expect(
    (
      await request.patch(`/api/v1/admin/categories/${category.id}/active`, {
        headers: { ...headers, ...(await csrf(request)) },
        data: { active: true, version: inactiveCategory.version },
      })
    ).ok(),
  ).toBe(true);
  expect((await request.get(`/api/v1/products/${product.id}`)).status()).toBe(200);
});

test('menu and product details fit a mobile viewport with real catalog data', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/menu');
  await expect(page.locator('.product-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.product-card').first().click();
  await expect(page.locator('.detail-grid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
