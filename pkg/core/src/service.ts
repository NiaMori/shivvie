import nodePath from 'node:path'
import fs from 'node:fs'
import { define } from '@niamori/utils'
import type { Manipulator } from '@niamori/manipulator.core'
import { resolveSync as mllyResolveSync } from 'mlly'
import { findUp, pathExists } from 'find-up'
import { z } from 'zod'
import type { ShivvieAction } from '@niamori/shivvie.core/action'
import { ShivvieActionConstructor } from '@niamori/shivvie.core/action'
import { rootTemporaryDirectory } from 'tempy'
import { ulid } from 'ulid'
import type { ShivvieModule } from '@niamori/shivvie.core/module'
import { renderTemplate } from './render.js'

export interface ShivvieService<T = Record<string, unknown>> {
  i: T
  p: ShivviePathService
  a: ShivvieActionService
  r: (template: string, additionalData?: Record<string, unknown>) => string
  u: ShivvieUtilsService
}

export interface ShivviePathService {
  fromCwd: (...paths: string[]) => string
  fromSource: (...paths: string[]) => string
  fromTarget: (...paths: string[]) => string
}

export interface ShivvieUtilsService {
  temp: {
    write: (name: string, text: string) => Promise<string>
  }
}

type isAllPropertyOptional<T> = { [K in keyof T]: undefined extends T[K] ? true : false } extends { [K in keyof T]: true } ? true : false

type GetInputData<T> = isAllPropertyOptional<T> extends true ? { inputData?: T } : { inputData: T }

export interface ShivvieActionService {
  render(props: {
    from: string
    to?: string
    additionalData?: Record<string, unknown>
  }): ShivvieAction

  cascade(props: {
    from: string
    to?: string
    ignore?: string[]
    additionalData?: Record<string, unknown>
  }): ShivvieAction

  manipulate<T extends keyof Manipulator>(preset: T, props: {
    path: string
    manipulator: Manipulator[T]['recipe']
    touch?: boolean
  }): ShivvieAction

  zxFunction (fn: () => Promise<void>): ShivvieAction

  shivvie<S extends { default: Pick<ShivvieModule, 'input'> } = { default: ShivvieModule }>(props: {
    from: string
    to: string
  } & GetInputData<z.infer<S['default']['input']>>): ShivvieAction

  ni(props?: { cwd?: string; names?: string[]; dev?: boolean }): ShivvieAction
  nun(props: { cwd?: string; names: string[] }): ShivvieAction
}

export async function createShivvieService<T extends Record<string, unknown>>(props: {
  i: T
  svModuleSourceDirPath: string
  targetDirPath: string
}) {
  const { i, svModuleSourceDirPath, targetDirPath } = props

  const registryPath = await findUp(async (directory: string) => {
    const packageJsonPath = nodePath.join(directory, 'package.json')

    if (await pathExists(packageJsonPath)) {
      const packageJson = z.object({
        keywords: z.array(z.string()).optional(),
      }).parse(JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8')))

      if (packageJson.keywords?.includes('shivvie-registry')) {
        return directory
      } else {
        return undefined
      }
    } else {
      return undefined
    }
  }, {
    type: 'directory',
    cwd: svModuleSourceDirPath,
  }) ?? svModuleSourceDirPath

  const r: ShivvieService<T>['r'] = (template, additionalData = {}) => {
    return renderTemplate(template, { ...i, ...additionalData })
  }

  const p: ShivviePathService = {
    fromCwd: (...paths) => {
      return nodePath.resolve(...paths)
    },

    fromSource: (...paths) => {
      return nodePath.resolve(svModuleSourceDirPath, ...paths)
    },

    fromTarget: (...paths) => {
      return nodePath.resolve(targetDirPath, ...paths)
    },
  }

  const render: ShivvieActionService['render'] = (props) => {
    const { from, to, additionalData } = props
    const renderingData = { ...i, ...additionalData }

    return ShivvieActionConstructor.render({
      from: r(p.fromSource(from), renderingData),
      to: r(to ? p.fromTarget(to) : p.fromTarget(from), renderingData),
      renderingData,
    })
  }

  const cascade: ShivvieActionService['cascade'] = (props) => {
    const { from, ignore, to, additionalData } = props
    const renderingData = { ...i, ...additionalData }

    return ShivvieActionConstructor.cascade({
      from: r(p.fromSource(from), renderingData),
      to: r(to ? p.fromTarget(to) : p.fromTarget(from), renderingData),
      ignore: ignore ?? [],
      renderingData,
    })
  }

  const manipulate: ShivvieActionService['manipulate'] = (preset, props) => {
    const { path, manipulator, touch = false } = props

    return ShivvieActionConstructor.manipulate({
      path: r(p.fromTarget(path)),
      preset,
      manipulator: manipulator as any,
      touch,
    })
  }

  const zxFunction: ShivvieActionService['zxFunction'] = (fn) => {
    return ShivvieActionConstructor.zx({
      scriptFn: fn,
      cwd: p.fromTarget(),
      zxPath: mllyResolveSync('zx', { url: p.fromSource('.') }),
    })
  }

  const shivvie: ShivvieActionService['shivvie'] = (props) => {
    const { from, to, inputData } = props

    return ShivvieActionConstructor.shivvie({
      from: from.startsWith('@:') ? r(nodePath.resolve(registryPath, from.slice(2))) : r(p.fromSource(from)),
      to: r(p.fromTarget(to)),
      inputData: inputData ?? {},
    })
  }

  const ni: ShivvieActionService['ni'] = (props = {}) => {
    const { cwd = '.', names = [], dev = false } = props

    return ShivvieActionConstructor.nypm({
      cwd: r(p.fromTarget(cwd)),
      names,
      dev,
      rm: false,
    })
  }

  const nun: ShivvieActionService['nun'] = (props) => {
    const { cwd = '.', names } = props

    return ShivvieActionConstructor.nypm({
      cwd: r(p.fromTarget(cwd)),
      names,
      dev: false,
      rm: true,
    })
  }

  const a = define<ShivvieActionService>({
    render,
    cascade,
    manipulate,
    zxFunction,
    shivvie,
    ni,
    nun,
  })

  const u = define<ShivvieUtilsService>({
    temp: {
      async write(name, text) {
        const tempPath = nodePath.join(rootTemporaryDirectory, 'shivvie', ulid(), name)
        await fs.promises.mkdir(nodePath.dirname(tempPath), { recursive: true })
        await fs.promises.writeFile(tempPath, text)
        return tempPath
      },
    },
  })

  const service = define<ShivvieService<T>>({
    i, p, a, r, u,
  })

  return service
}
