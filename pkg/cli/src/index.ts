import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import JSON5 from 'json5'
import { program } from 'commander'
import { ulid } from 'ulid'
import { z } from 'zod'
import { anyOf, charNotIn, createRegExp, exactly, maybe, oneOrMore, word } from 'magic-regexp'
import tiged from 'tiged'
import chalk from 'chalk'
import { rootTemporaryDirectory } from 'tempy'
import { addDependency, installDependencies } from 'nypm'
import { resolve as mllyResolve } from 'mlly'
import { findUp } from 'find-up'
import { bundleRequire } from 'bundle-require'
import { zodToTs, printNode } from 'zod-to-ts'

import { execShivvieModule } from '@niamori/shivvie.core/module'
import { logger } from '@niamori/shivvie.core/logger'
import type { ShivvieModule } from '@niamori/shivvie.core'

async function resolveShivvieUri(uri: string) {
  const re = createRegExp(exactly(
    maybe(
      word.as('registry'),
      exactly(':'),
    ),
    oneOrMore(charNotIn(':')).as('segments'),
  ).at.lineStart().at.lineEnd())

  const match = uri.match(re)
  if (!match) {
    throw new Error(`invalid shivvie uri "${uri}"`)
  }
  const { registry, segments } = z.object({
    registry: z.string().optional(),
    segments: z.string(),
  }).parse(match.groups)

  if (!registry || registry === 'file') {
    return path.resolve(await fs.promises.realpath(segments))
  } else if (registry === 'gh') {
    const re = createRegExp(exactly(
      exactly(oneOrMore(charNotIn('/'))).as('scope'),
      exactly('/'),
      exactly(oneOrMore(charNotIn('#/'))).as('name'),
      maybe(
        exactly('#'),
        oneOrMore(charNotIn('#/')),
      ).as('ref'),
      maybe(
        oneOrMore(
          exactly('/'),
          oneOrMore(charNotIn('/')),
        ),
        maybe(exactly('/')),
      ).as('subpath'),
    ).at.lineStart().at.lineEnd())

    const match = segments.match(re)
    if (!match) {
      throw new Error(`invalid shivvie uri "${uri}"`)
    }
    const { scope, name, ref, subpath = '' } = z.object({
      scope: z.string(),
      name: z.string(),
      ref: z.string().optional(),
      subpath: z.string().optional(),
    }).parse(match.groups)

    const tigedSrc = `github:${scope}/${name}${ref}`

    const emitter = tiged(tigedSrc, {
      disableCache: false,
      verbose: true,
    })

    emitter.on('info', (info) => {
      if (info.code === 'DEST_IS_EMPTY') {
        return
      }

      logger.info(`${chalk.cyan('tiged:')} ${info.message}`)
    })

    // since tiged handles caching, we can always clone to a temporary directory
    const tempdir = path.join(rootTemporaryDirectory, 'shivvie', ulid())
    await emitter.clone(tempdir)

    const modulePath = path.join(tempdir, subpath)

    async function isFile(path: string) {
      return await fs.promises.stat(path).then(st => st.isFile()).catch(() => false)
    }

    if (await isFile(path.join(modulePath, 'package.json')) || await isFile(path.join(tempdir, 'package.json'))) {
      await installDependencies({ cwd: modulePath })
    }

    return modulePath
  } else if (registry === 'npm') {
    const cache = path.join(os.homedir(), '.cache', 'shivvie', 'npm')

    const re = createRegExp(exactly(
      anyOf(
        oneOrMore(charNotIn('@/')),
        exactly('@', oneOrMore(charNotIn('@/')), '/', oneOrMore(charNotIn('@/'))),
      ).as('name'),
    ).at.lineStart().at.lineEnd())

    const match = segments.match(re)
    if (!match) {
      throw new Error(`invalid shivvie uri "${uri}"`)
    }

    const { name } = z.object({
      name: z.string(),
    }).parse(match.groups)

    await fs.promises.mkdir(cache, { recursive: true })
    if (!await fs.promises.stat(path.join(cache, 'package.json')).then(st => st.isFile()).catch(() => false)) {
      await fs.promises.writeFile(path.join(cache, 'package.json'), JSON.stringify({
        name: '@niamori/shivvie.npm-cache',
        private: true,
        license: 'MIT',
        packageManager: 'pnpm@8.6.7',
      }, null, 2))
    }

    await addDependency(name, { cwd: cache })

    const modulePath = path.dirname(fileURLToPath(await mllyResolve(`${name}/package.json`, { url: cache })))
    return modulePath
  } else {
    throw new Error(`invalid registry "${registry}" in shivvie uri "${uri}"`)
  }
}

program
  .showHelpAfterError(true)
  .showSuggestionAfterError(true)

const packageJsonPath = z.string().parse(await findUp('package.json', { cwd: new URL('.', import.meta.url).pathname }))

const packageJson = z.object({
  version: z.string(),
}).parse(JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8')))

program
  .name('shivvie')
  .version(packageJson.version)

program
  .command('exec')
  .summary('execute a shivvie to a target directory')
  .argument('<fr>', 'the shivvie uri to execute')
  .argument('<to>', 'the target directory to execute the shivvie module to')
  .option('-d, --data <data>', 'the data to pass to the template engine')
  .action(async (fr: string, to: string, options: Record<string, string | undefined>) => {
    const { data } = z.object({
      data: z.string().optional(),
    }).parse(options)

    const modulePath = await resolveShivvieUri(fr)

    const inputData = JSON5.parse(data ?? '{}')

    await execShivvieModule({
      inputData,
      modulePath,
      targetDirPath: path.resolve(process.cwd(), to),
    })
  })

program
  .command('info')
  .summary('get information about a shivvie')
  .argument('<fr>', 'the shivvie uri to get information about')
  .action(async (fr: string) => {
    const modulePath = await resolveShivvieUri(fr)

    const shivviePath = path.join(modulePath, 'shivvie.config.ts')

    const br = await bundleRequire({
      filepath: shivviePath,
    })

    const svModule = br.mod.default as ShivvieModule
    const zod = svModule.input

    const { node } = zodToTs(zod)
    const type = printNode(node)
    logger.info(`type Input = ${type}`)
  })

async function main() {
  await program.parseAsync()
}

main()
