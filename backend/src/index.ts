import './extension'
import App from './App'
import { exitSignalHandler, memoryDump } from './utils'

const app = await App.create().catch(e => {
  console.error('\nApp.create() error:\n', e)
  process.exit(1)
})

setInterval(
  async () => {
    memoryDump()
  },
  1000 * 60 * 10
)

exitSignalHandler(async () => {
  await app.stop()
})
