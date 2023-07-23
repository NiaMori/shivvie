import type { ShivvieModule } from '@niamori/shivvie.core/module'

export type { ShivvieModule } from '@niamori/shivvie.core/module'
export type { ShivvieAction } from '@niamori/shivvie.core/action'
export type { ShivvieService, ShivviePathService, ShivvieActionService } from '@niamori/shivvie.core/service'

export function defineShivvie<T extends Record<string, unknown>>(mod: ShivvieModule<T>) {
  return mod
}
