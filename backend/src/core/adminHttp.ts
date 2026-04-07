import { AuthHeaders } from '@shared-protocol/types'
import * as t from '@sinclair/typebox/type'
import { BaseApp } from '@src/BaseApp'
import { Config } from '@src/Config'
import { Error400 } from '@src/Errors'
import { Context } from './context'

const create = <App extends BaseApp>(app: App, services: { config: Config } & Context.Services) => {
  const checkAdmin = async (authUserId: string) => {
    const user = await services.pgDb.findUser(authUserId)
    if (!user || user.role !== 'admin') {
      throw new Error400('ACCESS_DENIED', 'Only Admin users can perform this action')
    }
  }

  return app.get(
    '/is-admin',
    async ({ headers }) => {
      const authHeaders = headers as AuthHeaders
      if (!authHeaders.authorization) {
        throw new Error400('MISSING_AUTHORIZATION', 'Authorization header is required')
      }
      const session = await services.pgDb.getSession(authHeaders.authorization)
      await checkAdmin(session.userId)
      return {}
    },
    {
      headers: AuthHeaders as any,
      response: t.Object({}) as any,
      detail: { tags: ['Admin'] },
    }
  )
}

export default { create }
