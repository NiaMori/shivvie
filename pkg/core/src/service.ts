import nodePath from 'node:path'
import { define } from '@niamori/utils'
import Handlebars from 'handlebars'
import type { Draft } from 'immer'
import type { manipulate } from '@niamori/json-manipulator'
import { resolveSync as mllyResolveSync } from 'mlly'
import type { ShivvieAction } from '@/action'
import { ShivvieActionConstructor } from '@/action'

export interface ShivvieService<T = Record<string, unknown>> {
  i: T
  p: ShivviePathService
  a: ShivvieActionService
  r: (template: string, additionalData?: Record<string, unknown>) => string
}

export interface ShivviePathService {
  fromCwd: (...paths: string[]) => string
  fromSource: (...paths: string[]) => string
  fromTarget: (...paths: string[]) => string
}

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

  manipulate<T extends keyof typeof manipulate>(preset: T, props: {
    path: string
    manipulator: Parameters<typeof manipulate[T]>[1]
  }): ShivvieAction

  manipulateJson<T = unknown>(props: {
    path: string
    manipulator: (dr: Draft<T>) => void
  }): ShivvieAction

  zxFunction (fn: () => Promise<void>): ShivvieAction

  shivvie(props: {
    from: string
    to: string
    inputData?: Record<string, unknown>
  }): ShivvieAction

  ni(props?: { cwd?: string; names?: string[]; dev?: boolean }): ShivvieAction
  nun(props: { cwd?: string; names: string[] }): ShivvieAction
}

export function createShivvieService<T extends Record<string, unknown>>(props: {
  i: T
  svModuleSourceDirPath: string
  targetDirPath: string
}) {
  const { i, svModuleSourceDirPath, targetDirPath } = props

  const r: ShivvieService<T>['r'] = (template, additionalData = {}) => {
    return Handlebars.compile(template)({
      ...i,
      ...additionalData,
    })
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
    const { path, manipulator } = props

    return ShivvieActionConstructor.manipulateJson({
      path: r(p.fromTarget(path)),
      manipulator: manipulator as any,
    })
  }

  const manipulateJson: ShivvieActionService['manipulateJson'] = (props) => {
    const { path, manipulator } = props

    return ShivvieActionConstructor.manipulateJson({
      path: r(p.fromTarget(path)),
      manipulator: manipulator as any,
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
      from: p.fromSource(from),
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
    manipulateJson,
    zxFunction,
    shivvie,
    ni,
    nun,
  })

  const service = define<ShivvieService<T>>({
    i, p, a, r,
  })

  return service
}