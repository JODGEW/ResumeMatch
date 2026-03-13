import { useState, useEffect, useCallback } from 'react';

export function useResendTimer(seconds = 30) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const restart = useCallback(() => {
    setRemaining(seconds);
  }, [seconds]);

  return { remaining, canResend: remaining <= 0, restart };
}
