import fs from 'node:fs'
import nodePath from 'node:path'
import type { ZodSchema } from 'zod'
import { concatMap, firstValueFrom, from, of, toArray } from 'rxjs'
import type { Observable, ObservableInput } from 'rxjs'
import { match } from 'ts-pattern'
import { bundleRequire } from 'bundle-require'
import chalk from 'chalk'
import fg from 'fast-glob'
import { manipulateJson } from '@niamori/json-manipulator'
import { define } from '@niamori/utils'
import type { OperationOptions } from 'nypm'
import { addDependency, addDevDependency, installDependencies, removeDependency } from 'nypm'
import { logger } from '@niamori/shivvie.core/logger'
import type { ShivvieAction } from '@niamori/shivvie.core/action'
import { ShivvieActionConstructor, isShivvieAction } from '@niamori/shivvie.core/action'
import type { ShivvieService } from '@niamori/shivvie.core/service'
import { createShivvieService } from '@niamori/shivvie.core/service'
import Handlebars from 'handlebars'

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

  const shivviePath = nodePath.join(modulePath, 'shivvie.config.ts')

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

export async function applyAction(action: ShivvieAction) {
  if (action.tag === 'render') {
    const { from, to, renderingData } = action.content

    logger.info(`Rendering '${chalk.gray(from)}' to '${chalk.gray(to)}'...`)

    const template = await fs.promises.readFile(from, 'utf-8')
    const rendered = Handlebars.compile(template)(renderingData)

    await fs.promises.mkdir(nodePath.dirname(to), { recursive: true })
    await fs.promises.writeFile(to, rendered)
  } else if (action.tag === 'cascade') {
    const { from, to, ignore, renderingData } = action.content

    logger.info(`Cascading '${chalk.gray(from)}' to '${chalk.gray(to)}'...`)

    const entries = fg.sync('**', {
      absolute: true,
      cwd: from,
      dot: true,
      ignore,
    })

    await Promise.all(entries.map(async (entry) => {
      return applyAction(ShivvieActionConstructor.render({
        from: entry,
        to: to + entry.slice(from.length),
        renderingData,
      }))
    }))
  } else if (action.tag === 'manipulateJson') {
    const { path, manipulator } = action.content

    logger.info(`Manipulating Json File '${chalk.gray(path)}'...`)

    const originalText = await fs.promises.readFile(path, 'utf-8')
    const manipulatedText = manipulateJson(originalText, manipulator)
    await fs.promises.writeFile(path, manipulatedText)
  } else if (action.tag === 'zx') {
    const { cwd, scriptFn, zxPath } = action.content

    logger.info(`Executing zx Script at '${chalk.gray(cwd)}'...`)

    const { $, within } = await import(zxPath) as typeof import('zx')

    await within(() => {
      $.prefix += 'export FORCE_COLOR=1; '
      $.cwd = cwd

      return scriptFn()
    })
  } else if (action.tag === 'shivvie') {
    const { from, to, inputData } = action.content

    logger.info(`Executing Shivvie '${chalk.gray(from)}' to '${chalk.gray(from)}'...`)

    await execShivvieModule({
      modulePath: from,
      targetDirPath: to,
      inputData,
    })
  } else if (action.tag === 'nypm') {
    const { cwd, names, dev, rm } = action.content

    const options = define<OperationOptions>({
      cwd,
      silent: true,
    })

    // FIXME: install/remove packages in one command
    if (rm) {
      if (names.length) {
        logger.info(`Removing npm package${names.length === 1 ? '' : 's'} '${names.join(', ')}' at '${chalk.gray(cwd)}'...`)

        for (const name of names) {
          await removeDependency(name, options)
        }
      }
    } else {
      if (names.length) {
        logger.info(`Installing npm package${names.length === 1 ? '' : 's'} '${names.join(', ')}' at '${chalk.gray(cwd)}'...`)

        if (dev) {
          for (const name of names) {
            await addDevDependency(name, options)
          }
        } else {
          for (const name of names) {
            await addDependency(name, options)
          }
        }
      } else {
        logger.info(`Installing npm dependencies at '${chalk.gray(cwd)}'...`)

        await installDependencies(options)
      }
    }
  } else {
    throw new Error(`Unknown Action: ${action}`)
  }
}
