# @niamori/shivvie (WIP)

> A scaffolding tool

> :warning: This project is still in early development. The documentation is not complete and the API is not stable. It's not ready for production use yet.

## Install

```
pnpm i -g @niamori/shivvie.cli
```

## Usage

```bash
shivvie exec gh:NiaMori/shivvie-registry/r/monorepo /tmp/42 -d '{ scope: "niamori", repo: "demo" }'
```

```txt
Usage: shivvie exec [options] <fr> <to>

Arguments:
  fr                 the shivvie uri to execute
  to                 the target directory to execute the shivvie module to

Options:
  -d, --data <data>  the data to pass to the template engine
  -h, --help         display help for command
```

Supported URI examples:
  - github: `gh:<owner>/<repo>[/subpath]`
  - npm: `npm:<package-name>`
  - file: `file:<path>` or `<path>`

## Shivvie Examples

[monorepo/j/pkg/shivvie.config.ts](https://github.com/NiaMori/shivvie-registry/blob/master/r/monorepo/j/pkg/shivvie.config.ts)

```typescript
import { defineShivvie } from '@niamori/shivvie.core'
import { z } from 'zod'

export default defineShivvie({
  input: z.object({
    scope: z.string(),
    repo: z.string(),
    name: z.string(),

    features: z.object({
      tsup: z.boolean().optional(),
      node: z.boolean().optional(),
      eslint: z.boolean().optional(),
      vitest: z.boolean().optional(),
    }).optional(),
  }),

  async *actions({ i, a }) {
    yield a.cascade({
      from: 't',
      to: 'pkg/{{name}}',
    })

    yield a.ni()

    const { features = {} } = i
    const { tsup = true, node = true, eslint = true, vitest = true } = features

    if (tsup) {
      yield a.shivvie({
        from: 'j/tsup',
        to: 'pkg/{{name}}',
      })
    }

    if (node) {
      yield a.shivvie({
        from: 'j/node',
        to: 'pkg/{{name}}',
      })
    }

    if (eslint) {
      yield a.shivvie({
        from: 'j/eslint',
        to: 'pkg/{{name}}',
      })
    }

    if (vitest) {
      yield a.shivvie({
        from: 'j/vitest',
        to: 'pkg/{{name}}',
      })
    }
  },
})
```

[monorepo/j/pkg/j/eslint/shivvie.config.ts](https://github.com/NiaMori/shivvie-registry/blob/master/r/monorepo/j/pkg/j/eslint/shivvie.config.ts)

```typescript
import { defineShivvie } from '@niamori/shivvie.core'
import z from 'zod'

export default defineShivvie({
  input: z.object({}),

  async *actions({ a }) {
    yield a.ni({
      names: ['eslint', '@niamori/eslint-config'],
      dev: true,
    })

    yield a.render({
      from: 't/.eslintrc.cjs',
      to: '.eslintrc.cjs',
    })

    yield a.manipulate('package.json', {
      path: 'package.json',
      manipulator(pkg) {
        pkg.scripts ||= {}
        pkg.scripts.lint ||= 'eslint .'
      },
    })
  },
})
```
