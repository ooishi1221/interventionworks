import { useEffect, useState } from 'react';
import { initDatabase } from '../db/database';

type DbStatus = 'loading' | 'ready' | 'error';

export function useDatabase() {
  const [status, setStatus] = useState<DbStatus>('loading');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setStatus('ready'))
      .catch((e) => {
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus('error');
      });
  }, []);

  return { status, error };
}
