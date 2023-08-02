import mustache from 'mustache'

mustache.escape = text => text

export function renderTemplate(template: string, data: Record<string, unknown>) {
  return mustache.render(template, data, {}, ['{{{', '}}}'])
}
