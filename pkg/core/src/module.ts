import path from 'node:path'
import fs from 'node:fs'
import type { ZodSchema } from 'zod'
import { concatMap, firstValueFrom, from, of, toArray } from 'rxjs'
import type { Observable, ObservableInput } from 'rxjs'
import { match } from 'ts-pattern'
import { bundleRequire } from 'bundle-require'
import chalk from 'chalk'
import { logger } from '@/logger'
import type { ShivvieAction } from '@/action'
import { applyAction, isShivvieAction } from '@/action'
import type { ShivvieService } from '@/service'
import { createShivvieService } from '@/service'

export interface ShivvieModule<T extends Record<string, unknown> = Record<string, unknown>> {
  input: ZodSchema<T>
  actions: (sv: ShivvieService<T>) => ObservableInput<ShivvieAction | ObservableInput<ShivvieAction>>
}

export async function execShivvieModule(props: {
  inputData: Record<string, unknown>
  modulePath: string
  targetDirPath: string
}) {
  const { inputData, modulePath, targetDirPath } = props

  const shivviePath = path.join(modulePath, 'shivvie.config.ts')

  logger.info(`Loading shivvie from '${chalk.gray(shivviePath)}'`)

  const br = await bundleRequire({
    filepath: shivviePath,
  })

  const svModule = br.mod.default as ShivvieModule
  const svModuleSourceDirPath = modulePath

  const i = await svModule.input.parseAsync(inputData)

  const service = await createShivvieService({
    i,
    svModuleSourceDirPath,
    targetDirPath,
  })

  const actions = await firstValueFrom(
    from(svModule.actions(service))
      .pipe(concatMap(it => match(it).returnType<Observable<ShivvieAction>>()
        .when(isShivvieAction, it => of(it))
        .otherwise(it => from(it)),
      ))
      .pipe(toArray()),
  )

  await fs.promises.mkdir(targetDirPath, { recursive: true })

  for (const action of actions) {
    await applyAction(action)
  }
}
