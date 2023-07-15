import type { ShivvieModule } from '@/module'

export * from './module'

export function defineShivvie<T extends Record<string, unknown>>(mod: ShivvieModule<T>) {
  return mod
}
