import type { Draft } from 'immer'
import { Enum } from '@niamori/utils'
import type { Manipulator } from '@niamori/manipulator.core'

const ShivvieActionIndicator = Symbol('ShivvieActionIndicator')

export type ShivvieAction = Enum<{
  render: {
    from: string
    to: string
    renderingData: Record<string, unknown>
  }

  cascade: {
    from: string
    to: string
    ignore: string[]
    renderingData: Record<string, unknown>
  }

  zx: {
    scriptFn: () => Promise<void>
    cwd: string
    zxPath: string
  }

  shivvie: {
    from: string
    to: string
    inputData: Record<string, unknown>
  }

  manipulate: {
    path: string
    preset: keyof Manipulator
    manipulator: (dr: Draft<unknown>) => void
  }

  nypm: {
    cwd: string
    names: string[]
    dev: boolean
    rm: boolean
  }
}, unknown, {
  [ShivvieActionIndicator]: typeof ShivvieActionIndicator
}>

export const ShivvieActionConstructor = Enum<ShivvieAction>({
  injector: () => ({ [ShivvieActionIndicator]: ShivvieActionIndicator }),
})

export function isShivvieAction(it: any): it is ShivvieAction {
  return it !== null && typeof it === 'object' && it[ShivvieActionIndicator] === ShivvieActionIndicator
}
