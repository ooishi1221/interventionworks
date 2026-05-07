import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { loadMemoryContext } from './memory.js'
import { chatWithBecky, type BeckyModel } from './becky.js'
import { textToSpeech } from './voice.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

fastify.get('/api/health', async () => ({
  status: 'ok',
  message: 'voice of becky api alive',
  timestamp: new Date().toISOString(),
}))

interface ChatBody {
  message: string
  model?: BeckyModel
}

fastify.post<{ Body: ChatBody }>('/api/chat', async (request, reply) => {
  const { message, model = 'haiku' } = request.body ?? {}

  if (!message || typeof message !== 'string' || !message.trim()) {
    reply.code(400)
    return { error: 'message is required' }
  }

  try {
    const memoryContext = await loadMemoryContext()
    const result = await chatWithBecky(message, memoryContext, { model })
    return {
      reply: result.reply,
      model: result.model,
      usage: result.usage,
    }
  } catch (err) {
    fastify.log.error(err)
    reply.code(500)
    return {
      error: err instanceof Error ? err.message : 'unknown error',
    }
  }
})

interface SpeakBody {
  text: string
}

fastify.post<{ Body: SpeakBody }>('/api/speak', async (request, reply) => {
  const { text } = request.body ?? {}

  if (!text || typeof text !== 'string' || !text.trim()) {
    reply.code(400)
    return { error: 'text is required' }
  }

  try {
    const audio = await textToSpeech(text)
    reply.type('audio/mpeg')
    return audio
  } catch (err) {
    fastify.log.error(err)
    reply.code(500)
    return {
      error: err instanceof Error ? err.message : 'unknown error',
    }
  }
})

const PORT = Number(process.env.PORT ?? 3001)
const HOST = '0.0.0.0'

try {
  await fastify.listen({ port: PORT, host: HOST })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
