import type { Page } from '@playwright/test';

/** A lista de obras da consulta começa recolhida: abre o bloco se ele estiver fechado. */
export async function abrirLista(page: Page) {
  const bloco = page.locator('details', { has: page.locator('summary', { hasText: 'Lista de obras e serviços' }) }).first();
  if (!(await bloco.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await bloco.locator(':scope > summary').click();
  }
}
