import type { Page } from 'playwright'

/**
 * Ouvre la feuille à rendre, et s'assure qu'elle est bien là.
 *
 * Le navigateur sans interface peut tomber sur un serveur en pleine
 * recompilation : il reçoit alors l'écran « This page couldn't load » du
 * cadre, sans une ligne d'article, et le PDF sortait ainsi. On attend donc
 * le tableau de la feuille, et l'on recharge deux fois au plus s'il ne vient
 * pas — puis on laisse les polices se poser avant de capturer.
 */
export async function chargerFeuille(page: Page, url: string) {
  for (let essai = 0; essai < 3; essai++) {
    await page.goto(url, { waitUntil: 'networkidle' })
    const ok = await page.locator('table').first().waitFor({ timeout: 8_000 }).then(() => true, () => false)
    if (ok) break
    await page.waitForTimeout(1_000)
  }
  await page.waitForTimeout(400)
}

/**
 * Rend la page ouverte en PDF, avec le pied commun.
 *
 * Toutes les feuilles sortent au même format, avec le même pied : « Page 2 /
 * 3 » sur chaque page. Une feuille de tournée de cent lignes tient sur trois
 * pages, et sans numéro on ne sait ni si l'une manque ni dans quel ordre les
 * relire. Le pied est composé par le moteur PDF, hors du document : aucun CSS
 * de la page ne peut le décaler, et la marge basse lui laisse sa place.
 *
 * La feuille de style porte déjà un « Page n / N » pour l'impression depuis
 * le navigateur ; ici on l'éteint, sinon les deux se superposaient.
 */
export async function rendrePdf(page: Page, titre: string) {
  await page.addStyleTag({ content: '@page { @bottom-right { content: none; } }' })
  const style = 'font-family: system-ui, sans-serif; font-size: 8.5px; color: #4a5f7d; '
    + 'width: 100%; padding: 0 12mm; display: flex; justify-content: space-between;'
  return page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      `<div style="${style}">`
      + `<span>${echapper(titre)}</span>`
      + '<span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>'
      + '</div>',
    margin: { top: '12mm', right: '12mm', bottom: '16mm', left: '12mm' },
  })
}

function echapper(v: string): string {
  return v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))
}
