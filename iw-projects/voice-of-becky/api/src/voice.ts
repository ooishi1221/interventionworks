import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
})

const DEFAULT_VOICE_ID = '8EkOjt4xTPGMclNlh1pk'

const DEFAULT_VOICE_SETTINGS = {
  stability: 0.30,
  similarityBoost: 0.65,
  style: 0.35,
  useSpeakerBoost: true,
  speed: 1.15,
}

export async function textToSpeech(
  text: string,
  options: { voiceId?: string } = {}
): Promise<Buffer> {
  const voiceId = options.voiceId ?? DEFAULT_VOICE_ID

  const audio = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: 'eleven_turbo_v2_5',
    outputFormat: 'mp3_44100_128',
    voiceSettings: DEFAULT_VOICE_SETTINGS,
  })

  const chunks: Buffer[] = []
  for await (const chunk of audio as AsyncIterable<Buffer>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
