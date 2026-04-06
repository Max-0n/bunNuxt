import { Commands } from '@pathly-protocol/logic/commands'
import { Error400 } from '@src/Errors'
import { isPromiseLike } from '@src/utils'
import { Context } from '../core/context'

type CommandType = Commands.Command['type']

type CommandReturn = Context.Type | Promise<Context.Type>
type CommandHandler<T> = (context: Context.Type, command: T, services: Context.Services) => CommandReturn

type Handlers = {
  [K in CommandType]: CommandHandler<Extract<Commands.Command, { type: K }>>
}

function notImplemented(_context: Context.Type): Context.Type {
  throw new Error400('NOT_IMPLEMENTED')
}

const handlers: Handlers = {
  OpenSlot: notImplemented,
}

export function applyCommand(
  context: Context.Type,
  command: Commands.Command,
  services: Context.Services
): Promise<Context.Type> {
  const handler = handlers[command.type] as CommandHandler<Commands.Command>
  const result = handler(context, command, services)
  if (isPromiseLike(result)) return result

  return Promise.resolve(result)
}
