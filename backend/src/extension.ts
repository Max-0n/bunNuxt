// extension.ts
declare global {
  interface String {
    trimTab(): string
  }
}

String.prototype.trimTab = function (): string {
  return this.replace(/^\s+/gm, '')
}

export {}
