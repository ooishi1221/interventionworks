import { useState, useEffect, type FormEvent } from 'react'
import { collection, addDoc, query, where, getDocs, serverTimestamp, getCountFromServer } from 'firebase/firestore'
import { db } from '../lib/firebase'

type Status = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error'
type OS = 'ios' | 'android'

const BETA_LIMIT = 100

export default function BetaForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [os, setOs] = useState<OS>('ios')
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
        os,
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

  const placeholder = os === 'ios'
    ? 'Apple ID のメールアドレス'
    : 'Google アカウントのメール'

  return (
    <form onSubmit={handleSubmit} className={`beta-form ${compact ? 'compact' : ''}`} id="beta-form">
      {remaining !== null && remaining > 0 && (
        <div className="beta-remaining">残り <strong>{remaining}</strong> 枠</div>
      )}
      {remaining === 0 && (
        <div className="beta-remaining full">定員に達しました</div>
      )}

      <div className="beta-os-row">
        <label className={`beta-os-chip ${os === 'ios' ? 'active' : ''}`}>
          <input
            type="radio"
            name="os"
            value="ios"
            checked={os === 'ios'}
            onChange={() => setOs('ios')}
          />
          <span>iPhone</span>
        </label>
        <label className={`beta-os-chip ${os === 'android' ? 'active' : ''}`}>
          <input
            type="radio"
            name="os"
            value="android"
            checked={os === 'android'}
            onChange={() => setOs('android')}
          />
          <span>Android</span>
        </label>
      </div>

      <div className="beta-form-row">
        <input
          type="email"
          required
          placeholder={placeholder}
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

      <p className="beta-form-note">
        {os === 'ios'
          ? '※ TestFlight で招待メールをお送りします。Apple ID のメールをご入力ください。'
          : '※ Firebase App Distribution で招待メールをお送りします。Google アカウントのメールをご入力ください。'}
      </p>

      {status === 'duplicate' && (
        <p className="beta-form-error">このメールアドレスは登録済みです。</p>
      )}
      {status === 'error' && (
        <p className="beta-form-error">送信に失敗しました。もう一度お試しください。</p>
      )}
    </form>
  )
}
