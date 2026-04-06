export namespace Errors {
  export class Client extends Error {
    constructor(
      public error_code: string,
      public error_message?: string,
      public params?: Record<string, string | number | boolean>
    ) {
      super(error_code + ' ' + error_message)
      this.name = 'Client'
      Object.setPrototypeOf(this, Client.prototype)
    }

    static UPGRADE_COOLDOWN = (arg: { upgradeId: string; cooldownSeconds: number }) =>
      new Client('UPGRADE_COOLDOWN', `Upgrade '${arg.upgradeId}' on cooldown ${arg.cooldownSeconds} seconds`, arg)
  }

  // Кидание этой ошибки будет приводить к переполучению токена на клиенте, и его можно зациклить.
  // Нужно быть аккуратным.
  export class Unauthorized extends Error {
    constructor(
      public error_code: string,
      public error_message?: string,
      public params?: Record<string, string | number | boolean>
    ) {
      super(error_code + ' ' + error_message)
      this.name = 'Unauthorized'
      Object.setPrototypeOf(this, Unauthorized.prototype)
    }
  }

  export class Forbidden extends Error {
    constructor(
      public error_code: string,
      public error_message?: string,
      public params?: Record<string, string | number | boolean>
    ) {
      super(error_code + ' ' + error_message)
      this.name = 'Forbidden'
      Object.setPrototypeOf(this, Forbidden.prototype)
    }
  }
}

// короткий алиас, чтобы более просто и удобно писать (т.к. используется очень много где)
export const Error400 = Errors.Client
export const Error401 = Errors.Unauthorized
export const Error403 = Errors.Forbidden
