import nodePath from 'node:path'
import fs from 'node:fs'
import type { Draft } from 'immer'
import { Enum, define } from '@niamori/utils'
import Handlebars from 'handlebars'
import { manipulateJson } from '@niamori/json-manipulator'
import fg from 'fast-glob'
import type { OperationOptions } from 'nypm'
import { addDependency, addDevDependency, installDependencies, removeDependency } from 'nypm'
import chalk from 'chalk'
import { execShivvieModule } from '@/module'
import { logger } from '@/logger'

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

  manipulateJson: {
    path: string
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
