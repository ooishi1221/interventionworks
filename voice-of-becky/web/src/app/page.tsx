'use client'

import { useState, useRef, useEffect, type FormEvent } from 'react'

const API_URL = 'http://100.86.242.55:3001'

type Message = {
  role: 'user' | 'becky' | 'debug'
  text: string
  model?: string
  usage?: {
    input_tokens: number
    output_tokens: number
  }
  audioUrl?: string
}

type BeckyModel = 'haiku' | 'opus'

async function fetchAudioUrl(text: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [model, setModel] = useState<BeckyModel>('haiku')
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, loading])

  function playAudio(url: string) {
    const audio = audioRef.current
    if (!audio) return
    audio.src = url
    audio.play().catch(() => {
      // autoplay blocked — user can press 🔊 manually
    })
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()

    const ta = textareaRef.current
    const raw = ta?.value ?? ''
    const trimmed = raw.trim()

    if (!trimmed || loading) return

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    if (ta) ta.value = ''
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, model }),
      })
      const data = await res.json()

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: 'becky', text: `[エラー] ${data.error}` },
        ])
      } else {
        const replyText: string = data.reply
        const newMsgIndex = messages.length + 1

        setMessages((prev) => [
          ...prev,
          {
            role: 'becky',
            text: replyText,
            model: data.model,
            usage: data.usage,
          },
        ])

        if (voiceEnabled && replyText.trim()) {
          const audioUrl = await fetchAudioUrl(replyText)
          if (audioUrl) {
            setMessages((prev) =>
              prev.map((m, i) =>
                i === newMsgIndex ? { ...m, audioUrl } : m
              )
            )
            playAudio(audioUrl)
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'becky',
          text: `[通信エラー] ${err instanceof Error ? err.message : String(err)}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <audio ref={audioRef} hidden />

      <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <div>
          <h1 className="text-base font-semibold tracking-tight">
            Voice of Becky
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Phase 1 Day 3 — Mac mini × ElevenLabs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVoiceEnabled((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              voiceEnabled
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
            }`}
          >
            🔊 {voiceEnabled ? 'ON' : 'OFF'}
          </button>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as BeckyModel)}
            className="rounded border border-stone-300 bg-stone-100 px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-800"
          >
            <option value="haiku">Haiku 4.5</option>
            <option value="opus">Opus 4.7</option>
          </select>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="mt-12 text-center text-sm text-stone-400 dark:text-stone-600">
            ベッキーに話しかけてみる
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === 'debug') {
            return (
              <div
                key={i}
                className="mx-auto max-w-[95%] whitespace-pre-wrap break-all rounded-md border border-amber-400 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              >
                {msg.text}
              </div>
            )
          }
          return (
            <div
              key={i}
              className={`max-w-[85%] ${msg.role === 'user' ? 'ml-auto' : 'mr-auto'}`}
            >
              <div
                className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900'
                    : 'bg-stone-200 dark:bg-stone-800'
                }`}
              >
                {msg.text}
              </div>
              {msg.role === 'becky' && (
                <div className="mt-1 flex items-center gap-2 px-1 text-[10px] text-stone-400 dark:text-stone-600">
                  {msg.usage && (
                    <span>
                      {msg.model?.includes('opus') ? 'Opus' : 'Haiku'} · in{' '}
                      {msg.usage.input_tokens.toLocaleString()} / out{' '}
                      {msg.usage.output_tokens.toLocaleString()}
                    </span>
                  )}
                  {msg.audioUrl && (
                    <button
                      type="button"
                      onClick={() => playAudio(msg.audioUrl!)}
                      className="rounded bg-stone-300 px-2 py-0.5 text-[10px] text-stone-700 dark:bg-stone-700 dark:text-stone-300"
                    >
                      🔊 再生
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {loading && (
          <div className="mr-auto max-w-[85%]">
            <div className="rounded-2xl bg-stone-200 px-4 py-2.5 text-sm dark:bg-stone-800">
              <span className="inline-block animate-pulse">…</span>
            </div>
          </div>
        )}
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-stone-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-stone-800"
      >
        <textarea
          ref={textareaRef}
          name="message"
          defaultValue=""
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="話しかける（Enter で送信、Shift + Enter で改行）"
          rows={2}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="flex-1 resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-stone-400 dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 self-end rounded-lg bg-stone-900 px-5 py-3 text-sm font-semibold text-stone-50 active:scale-95 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
        >
          送信
        </button>
      </form>
    </main>
  )
}
