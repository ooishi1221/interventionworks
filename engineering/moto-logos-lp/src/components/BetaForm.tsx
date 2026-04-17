import { useState, useEffect, type FormEvent } from 'react'
import { collection, addDoc, query, where, getDocs, serverTimestamp, getCountFromServer } from 'firebase/firestore'
import { db } from '../lib/firebase'

type Status = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error'

const BETA_LIMIT = 100

export default function BetaForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    getCountFromServer(collection(db, 'beta_signups'))
      .then((snap) => setRemaining(Math.max(0, BETA_LIMIT - snap.data().count)))
      .catch(() => {})
  }, [status])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    setStatus('submitting')

    try {
      const q = query(collection(db, 'beta_signups'), where('email', '==', trimmed))
      const snap = await getDocs(q)
      if (!snap.empty) {
        setStatus('duplicate')
        return
      }

      await addDoc(collection(db, 'beta_signups'), {
        email: trimmed,
        createdAt: serverTimestamp(),
        source: 'lp',
      })
      setStatus('success')
      setEmail('')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className={`beta-form-result ${compact ? 'compact' : ''}`}>
        <span className="beta-form-check">&#10003;</span>
        <p className="beta-form-msg">登録しました。βテスト開始時に招待リンクをお届けします。</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={`beta-form ${compact ? 'compact' : ''}`} id="beta-form">
      {remaining !== null && remaining > 0 && (
        <div className="beta-remaining">残り <strong>{remaining}</strong> 枠</div>
      )}
      {remaining === 0 && (
        <div className="beta-remaining full">定員に達しました</div>
      )}
      <div className="beta-form-row">
        <input
          type="email"
          required
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (status === 'error' || status === 'duplicate') setStatus('idle')
          }}
          className="beta-form-input"
          disabled={status === 'submitting' || remaining === 0}
        />
        <button
          type="submit"
          className="btn-primary beta-form-btn"
          disabled={status === 'submitting' || remaining === 0}
        >
          {status === 'submitting' ? '送信中...' : 'βテスターに参加する'}
        </button>
      </div>
      {status === 'duplicate' && (
        <p className="beta-form-error">このメールアドレスは登録済みです。</p>
      )}
      {status === 'error' && (
        <p className="beta-form-error">送信に失敗しました。もう一度お試しください。</p>
      )}
    </form>
  )
}
