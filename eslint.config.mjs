import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// Les configurations plates fournies par Next 16, telles quelles : la couche
// de compatibilité `FlatCompat` plantait sur une référence circulaire du
// greffon React, et le lint ne tournait plus du tout.
export default [
  ...nextVitals,
  ...nextTypescript,
  { ignores: ['src/generated/**', '.next/**', 'node_modules/**', 'scripts/.tmp-*'] },
]
