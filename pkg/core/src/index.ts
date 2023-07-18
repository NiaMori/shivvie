import type { ShivvieModule } from '@/module'

export type { ShivvieModule } from '@/module'
export type { ShivvieAction } from '@/action'
export type { ShivvieService, ShivviePathService, ShivvieActionService } from '@/service'

export function defineShivvie<T extends Record<string, unknown>>(mod: ShivvieModule<T>) {
  return mod
}
