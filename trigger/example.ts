import { logger, task } from '@trigger.dev/sdk'

export const helloWorldTask = task({
  id: 'hello-world',
  run: async (payload: { name: string }) => {
    logger.log('Hello from Trigger.dev', { name: payload.name })
    return { message: `Hello ${payload.name}` }
  },
})
