declare module 'tiged' {
  export default function tiged(src: string, opts: {}): Degit

  interface Degit extends NodeJS.EventEmitter {
    clone(dest: string): Promise<void>
  }
}
