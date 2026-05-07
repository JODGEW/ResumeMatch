import { useCallback, useEffect, useState } from 'react';

export type MicrophoneCheckStatus = 'idle' | 'checking' | 'ready' | 'permission-needed' | 'error';
export type MicrophoneKind = 'bluetooth' | 'wired' | 'unknown';

export interface UseMicrophoneCheckReturn {
  status: MicrophoneCheckStatus;
  defaultMicLabel: string | null;
  defaultMicKind: MicrophoneKind | null;
  allMics: MediaDeviceInfo[];
  requestPermission: () => Promise<void>;
  recheck: () => Promise<void>;
  error: string | null;
}

const BLUETOOTH_PATTERNS = [
  /\bairpods?\b/i,
  /\bbluetooth\b/i,
  /\bbt\s*(headset|headphones?)\b/i,
  /\bwireless\b/i,
  /\bbeats\b/i,
  /\bbuds?\b/i,
  /\bheadset\b/i,
];

const WIRED_PATTERNS = [
  /\bbuilt[-\s]?in\b/i,
  /\binternal\b/i,
  /\bmacbook\b/i,
  /\bdisplay audio\b/i,
  /\busb\b/i,
];

function classifyMicrophone(label: string): MicrophoneKind {
  const normalized = label.trim();
  if (!normalized) return 'unknown';

  if (WIRED_PATTERNS.some(pattern => pattern.test(normalized))) {
    return 'wired';
  }
  if (BLUETOOTH_PATTERNS.some(pattern => pattern.test(normalized))) {
    return 'bluetooth';
  }
  return 'unknown';
}

function isGenericLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return normalized === ''
    || normalized === 'default'
    || normalized === 'communications'
    || normalized === 'default microphone'
    || normalized === 'default audio input';
}

function getDefaultMicrophone(audioInputs: MediaDeviceInfo[]): MediaDeviceInfo | null {
  if (audioInputs.length === 0) return null;

  const defaultInput = audioInputs.find(device => device.deviceId === 'default');
  if (defaultInput && !isGenericLabel(defaultInput.label)) {
    return defaultInput;
  }

  const labeledInput = audioInputs.find(device => !isGenericLabel(device.label));
  return labeledInput ?? defaultInput ?? audioInputs[0];
}

function getErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Microphone permission was denied.';
    if (err.name === 'NotFoundError') return 'No microphone was found.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Could not detect your microphone.';
}

export function useMicrophoneCheck(): UseMicrophoneCheckReturn {
  const [status, setStatus] = useState<MicrophoneCheckStatus>('idle');
  const [defaultMicLabel, setDefaultMicLabel] = useState<string | null>(null);
  const [defaultMicKind, setDefaultMicKind] = useState<MicrophoneKind | null>(null);
  const [allMics, setAllMics] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const enumerateMicrophones = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setStatus('error');
      setError('Microphone detection is not available in this browser.');
      return;
    }

    setStatus('checking');
    setError(null);

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAllMics(audioInputs);

      if (audioInputs.length === 0) {
        setDefaultMicLabel(null);
        setDefaultMicKind(null);
        setStatus('error');
        setError('No microphone was found.');
        return;
      }

      const labelsAreVisible = audioInputs.some(device => device.label.trim().length > 0);
      if (!labelsAreVisible) {
        setDefaultMicLabel(null);
        setDefaultMicKind(null);
        setStatus('permission-needed');
        return;
      }

      const defaultMic = getDefaultMicrophone(audioInputs);
      const label = defaultMic?.label.trim() || 'Unknown microphone';

      setDefaultMicLabel(label);
      setDefaultMicKind(classifyMicrophone(label));
      setStatus('ready');
    } catch (err) {
      setDefaultMicLabel(null);
      setDefaultMicKind(null);
      setStatus('error');
      setError(getErrorMessage(err));
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('Microphone permission is not available in this browser.');
      return;
    }

    setStatus('checking');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      await enumerateMicrophones();
    } catch (err) {
      setDefaultMicLabel(null);
      setDefaultMicKind(null);
      setStatus('error');
      setError(getErrorMessage(err));
    }
  }, [enumerateMicrophones]);

  useEffect(() => {
    void enumerateMicrophones();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

    function handleDeviceChange() {
      void enumerateMicrophones();
    }

    navigator.mediaDevices.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [enumerateMicrophones]);

  return {
    status,
    defaultMicLabel,
    defaultMicKind,
    allMics,
    requestPermission,
    recheck: enumerateMicrophones,
    error,
  };
}
