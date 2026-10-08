import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { countDays } from '@/lib/utils'
import type { Board } from './day-board'

/** Total de la journée, toutes commandes confondues. Cliquable. */
export function DayTotals({ board }: { board: Board }) {
  // Tous les départements sur une seule page, chacun avec son tableau —
  // comme « Voir toute la journée » d'un département, mais pour tous.
  const href = `/economat/articles/tous?jour=${board.day}${board.isRange ? `&jusquau=${board.dayTo}` : ''}`

  return (
    <>
      {/* Le total ferme la page avec le même poids que le bandeau de tête :
          la journée s'ouvre et se referme sur le même fond sombre. */}
      <Link
        href={href}
        className="group relative mt-6 block w-full overflow-hidden rounded-[calc(var(--radius)+6px)] border border-white/12 p-4 text-left text-white shadow-[0_24px_60px_-22px_rgb(var(--shadow-ambient)/0.5)] transition-transform duration-200 hover:-translate-y-0.5 sm:p-5"
        style={{ background: 'linear-gradient(150deg, #16305c 0%, #0f2247 60%, #0b1830 100%)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(30rem 16rem at 95% 0%, rgb(106 168 242 / 0.28), transparent 62%)',
          }}
        />
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-white/50 sm:text-[0.74rem]">
              {board.isRange ? 'Total de la période' : 'Total de la journée'}
            </p>
            <p className="mt-1 text-[0.92rem] tabular-nums text-white/65 sm:text-[0.85rem]">
              {board.departments.length} département{board.departments.length > 1 ? 's' : ''} ·{' '}
              {board.orderCount} ticket{board.orderCount > 1 ? 's' : ''} · {board.lineCount} ligne
              {board.lineCount > 1 ? 's' : ''}
              {board.isRange ? ` · ${countDays(board.day, board.dayTo)} journées` : ''}
            </p>
            <p className="mt-2 inline-flex items-center gap-1 text-[0.92rem] font-semibold text-[#8fc0f7] sm:text-[0.85rem]">
              Voir tous les articles
              <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </p>
          </div>
          {/* Un seul chiffre, et qui veut dire quelque chose : la part
              servie. Cumuler des kilos et des litres n'en disait rien. */}
          <div className="text-right">
            <p className="text-[0.76rem] font-medium uppercase tracking-wide text-white/50 sm:text-[0.72rem]">Servi</p>
            <p className="text-[2rem] font-bold leading-none tabular-nums text-[#6ee7b7] sm:text-[1.85rem]">
              {board.totalAsked > 0
                ? Math.min(100, Math.round((board.totalServed / board.totalAsked) * 100))
                : 0}
              <span className="text-[1.2rem] text-white/45">%</span>
            </p>
          </div>
        </div>
      </Link>
    </>
  )
}
