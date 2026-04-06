import type { GameMode } from '@shared-protocol/types'
import { BaseApp } from '@src/BaseApp'
import { Config } from '@src/Config'
import { ALL_GAME_MODES } from './constants'
import { Context } from './context'
import { LogicGame } from './logicGame'

// Хранилище WebSocket соединений
// userId -> Set<WebSocket>
const userConnections = new Map<string, Set<any>>()
// ws.id -> userId для быстрого поиска
const wsToUserId = new Map<string, string>()

// Функции для работы с соединениями
export const WebSocketManager = {
  // Отправить сообщение конкретному пользователю
  sendToUser(userId: string, message: string | object) {
    const connections = userConnections.get(userId)
    if (!connections || connections.size === 0) {
      return false
    }

    const messageStr = typeof message === 'string' ? message : JSON.stringify(message)
    let sent = false

    connections.forEach(ws => {
      try {
        // В Elysia WebSocket, readyState доступен через ws.raw.readyState
        const rawWs = (ws as any).raw || ws
        if (rawWs.readyState === 1) {
          // WebSocket.OPEN = 1
          ws.send(messageStr)
          sent = true
        }
      } catch (error) {
        console.error(`[WebSocket] Error sending to user ${userId}:`, error)
      }
    })

    return sent
  },

  // Отправить сообщение всем подключенным пользователям
  broadcast(message: string | object) {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message)
    let count = 0

    userConnections.forEach((connections, userId) => {
      connections.forEach(ws => {
        try {
          // В Elysia WebSocket, readyState доступен через ws.raw.readyState
          const rawWs = (ws as any).raw || ws
          if (rawWs.readyState === 1) {
            // WebSocket.OPEN = 1
            ws.send(messageStr)
            count++
          }
        } catch (error) {
          console.error(`[WebSocket] Error broadcasting to user ${userId}:`, error)
        }
      })
    })

    return count
  },

  // Получить количество активных соединений пользователя
  getUserConnectionCount(userId: string): number {
    return userConnections.get(userId)?.size || 0
  },

  // Получить общее количество активных соединений
  getTotalConnectionCount(): number {
    let total = 0
    userConnections.forEach(connections => {
      total += connections.size
    })
    return total
  },
}

const create = <App extends BaseApp>(app: App, services: { config: Config } & Context.Services) => {
  return app.ws('/ws', {
    idleTimeout: 60,
    maxPayloadLength: 1024 * 1024,
    async open(ws) {
      try {
        // Получаем токен из query параметров
        // В Elysia WebSocket query параметры доступны через ws.data.query
        const query = (ws.data as any).query as Record<string, string | undefined> | undefined
        const token = query?.token

        if (!token) {
          console.warn('[WebSocket] ❌ No token provided, closing connection:', ws.id)
          ws.close(1008, JSON.stringify({ type: 'error', message: 'Token is required' }))
          return
        }

        // Проверяем токен и получаем сессию
        const session = await services.pgDb.getSessionOrUndefined(`Bearer ${token}`)

        if (!session) {
          console.warn('[WebSocket] ❌ Invalid token, closing connection:', ws.id)
          ws.close(1008, JSON.stringify({ type: 'error', message: 'Invalid token' }))
          return
        }

        const userId = session.userId

        // Сохраняем соединение
        if (!userConnections.has(userId)) {
          userConnections.set(userId, new Set())
        }
        userConnections.get(userId)!.add(ws)
        wsToUserId.set(ws.id, userId)

        console.log('[WebSocket] ✅ Client connected successfully:', { wsId: ws.id, userId })

        // Подтверждаем подключение
        ws.send(JSON.stringify({ type: 'connected', id: ws.id, userId }))

        // Отправляем текущее состояние раундов для ВСЕХ режимов игры при подключении
        const roundsState: Record<GameMode, any> = {} as Record<GameMode, any>
        for (const game of ALL_GAME_MODES) {
          roundsState[game] = await LogicGame.getCurrentRound(services.pgDb, game)
        }
        ws.send(
          JSON.stringify({
            type: 'roundState',
            state: roundsState,
          })
        )

        // Отправляем события о ТОП победителе и победителе предыдущего раунда для ВСЕХ режимов игры
        await LogicGame.sendAllWinnerEvents(services.pgDb, userId)
      } catch (error) {
        console.error('[WebSocket] ❌ Error in open handler:', error)
        try {
          ws.close(1011, JSON.stringify({ type: 'error', message: 'Internal server error' }))
        } catch (closeError) {
          console.error('[WebSocket] Error closing connection:', closeError)
        }
      }
    },
    message(ws, message) {
      try {
        console.log('[WebSocket] Message received:', message)

        // Handle ping/pong
        if (typeof message === 'string' && message === 'ping') {
          ws.send('pong')
          return
        }

        // Try to parse JSON
        let data: any
        if (typeof message === 'string') {
          try {
            data = JSON.parse(message)
          } catch (parseError) {
            console.warn('[WebSocket] Failed to parse message as JSON:', message)
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format' }))
            return
          }
        } else {
          data = message
        }

        // Handle ping as object
        if (typeof data === 'object' && data?.type === 'ping') {
          ws.send('pong')
          return
        }

        // Echo message back as example
        ws.send(JSON.stringify({ type: 'message', data, received: true }))
      } catch (error) {
        console.error('[WebSocket] Error in message handler:', error)
        try {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }))
        } catch (sendError) {
          console.error('[WebSocket] Error sending error message:', sendError)
        }
      }
    },
    close(ws) {
      try {
        const userId = wsToUserId.get(ws.id)
        if (userId) {
          const connections = userConnections.get(userId)
          if (connections) {
            connections.delete(ws)
            if (connections.size === 0) {
              userConnections.delete(userId)
            }
          }
          wsToUserId.delete(ws.id)
          console.log('[WebSocket] Client disconnected:', { wsId: ws.id, userId })
        } else {
          console.log('[WebSocket] Client disconnected (no userId):', ws.id)
        }
      } catch (error) {
        console.error('[WebSocket] Error in close handler:', error)
      }
    },
  })
}

export default { create }
