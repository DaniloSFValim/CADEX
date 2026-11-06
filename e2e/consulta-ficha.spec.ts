import { expect, test } from '@playwright/test';
import { instalarBackend } from './apoio/backend';
import { licenca } from './apoio/dados';

test('consultar uma licença abre a ficha de leitura, sem formulário', async ({ page }) => {
  const l = licenca({ numero: '777/2026', contratante_id: 'op1', escopo: 'Rede de fibra no centro' });
  await instalarBackend(page, { licencas: [l] });
  await page.goto(`/obras/${l.id}`);

  await expect(page.getByRole('heading', { name: 'Licença 777/2026' })).toBeVisible();
  const ficha = page.locator('#ficha-impressa');
  await expect(ficha.getByText('Rede de fibra no centro')).toBeVisible();
  await expect(ficha.getByRole('heading', { name: 'Localização' })).toBeVisible();
  await expect(ficha.getByRole('heading', { name: 'Condicionantes' })).toBeVisible();
  // Só leitura: nenhum campo editável na ficha.
  await expect(ficha.locator('input, select, textarea')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Imprimir ou salvar em PDF' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar à consulta' })).toBeVisible();
});

test('editar é uma ação explícita e leva ao formulário; sem permissão, não aparece', async ({ page }) => {
  const l = licenca({ numero: '778/2026' });
  await instalarBackend(page, { licencas: [l] });
  await page.goto(`/obras/${l.id}`);
  await page.getByRole('button', { name: 'Editar licença' }).click();
  await expect(page).toHaveURL(new RegExp(`/obras/${l.id}/editar$`));
  await expect(page.getByRole('button', { name: /Salvar|Registrar licença/ }).first()).toBeVisible();
});

test('quem não pode licenciar não vê "Editar" e, pela URL de edição, cai na ficha', async ({ page }) => {
  const l = licenca({ numero: '779/2026' });
  await instalarBackend(page, { licencas: [l], perfil: 'cisp' });
  await page.goto(`/obras/${l.id}`);
  await expect(page.getByRole('heading', { name: 'Licença 779/2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar licença' })).toHaveCount(0);
  await page.goto(`/obras/${l.id}/editar`);
  await expect(page).toHaveURL(new RegExp(`/obras/${l.id}$`));
});

test('na lista de obras, o registro abre a ficha, e "Voltar à consulta" retorna à lista', async ({ page }) => {
  const l = licenca({ numero: '780/2026' });
  await instalarBackend(page, { licencas: [l] });
  await page.goto('/obras');
  await page.getByRole('link', { name: '780/2026' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/obras/${l.id}$`));
  await page.getByRole('button', { name: 'Voltar à consulta' }).click();
  await expect(page).toHaveURL(/\/obras$/);
});
