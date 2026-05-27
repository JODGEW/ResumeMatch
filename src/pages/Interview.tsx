import { useState, useEffect, useRef, useCallback, type PointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useMicrophoneCheck } from '../hooks/useMicrophoneCheck';
import { useMicrophoneLevel } from '../hooks/useMicrophoneLevel';
import {
  startInterview,
  submitTurn,
  endInterview,
  getSession,
  isMissingInterviewSessionError,
  type ConversationTurn,
  type StartInterviewResponse,
} from '../api/interview';
import {
  clearInterviewPointerKey,
  getInterviewPointerKey,
  loadInterviewPointer,
  saveInterviewPointer,
  type SavedInterviewPointer,
} from '../utils/interviewPointer';
import { isInterviewClosingPrompt, isInterviewQuestionTurn } from '../utils/interviewQuestions';
import { awaitPendingTurnSubmission, getInterviewControlState } from '../utils/interviewControls';
import { UpgradePrompt } from '../components/UpgradePrompt';
import './Interview.css';

type InterviewState = 'setup' | 'starting' | 'active' | 'thinking' | 'speaking' | 'completed' | 'loading';

interface LocationState {
  resumeText?: string;
  jobDescription?: string;
  resumeSessionId?: string;
  fileName?: string;
  analysisId?: string;
  jobTitle?: string;
  matchScore?: number;
  interviewType?: 'behavioral' | 'technical';
  startFresh?: boolean;
}

function getPositiveNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function Interview() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;
  const setupJobTitle = state?.jobTitle?.trim() || 'Current analysis';

  const [interviewState, setInterviewState] = useState<InterviewState>('setup');
  const [selectedType, setSelectedType] = useState<'behavioral' | 'technical'>(
    (location.state as LocationState | null)?.interviewType || 'behavioral'
  );
  const [sessionId, setSessionId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [turnNumber, setTurnNumber] = useState(0);
  const [error, setError] = useState('');
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [timeLimit, setTimeLimit] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [answerElapsed, setAnswerElapsed] = useState(0);
  const [answerDurations, setAnswerDurations] = useState<number[]>([]);
  const [warnedAt2Min, setWarnedAt2Min] = useState(false);
  const [sessionKeyterms, setSessionKeyterms] = useState<string[]>([]);
  const [savingFinalAnswer, setSavingFinalAnswer] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const answerTimerRef = useRef<ReturnType<typeof setInterval>>();
  const answerStartRef = useRef(0);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(0);
  const lsKeyRef = useRef('');
  const pushToTalkActiveRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const startInFlightRef = useRef(false);
  const submitInFlightRef = useRef<Promise<unknown> | null>(null);

  const {
    isListening,
    isArming,
    isSupported,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();
  const microphoneCheck = useMicrophoneCheck();
  const micLevel = useMicrophoneLevel();
  const isIOS = typeof navigator !== 'undefined' && /iP(ad|hone|od)/.test(navigator.userAgent);

  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem('resumematch_tts') !== 'off'; } catch { return true; }
  });
  const ttsEnabledRef = useRef(ttsEnabled);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  function toggleTts() {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    ttsEnabledRef.current = next;
    try { localStorage.setItem('resumematch_tts', next ? 'on' : 'off'); } catch {
      // Local storage may be unavailable in private or restricted contexts.
    }
    if (!next) cancelTts();
  }

  function cancelTts() {
    speechSynthesis.cancel();
    utteranceRef.current = null;
  }

  const speakQuestion = useCallback((text: string) => {
    if (!ttsEnabledRef.current || typeof speechSynthesis === 'undefined') {
      setInterviewState('active');
      return;
    }
    cancelTts();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    // Pick the best available US English voice.
    const voices = speechSynthesis.getVoices();
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    const enUSVoices = enVoices.filter(v => v.lang.toLowerCase().startsWith('en-us'));
    const preferred =
      // Chrome network voice
      enUSVoices.find(v => v.name === 'Google US English')
      // macOS US voices
      || enUSVoices.find(v => /siri/i.test(v.name) && /female|zoe|nicky|samantha/i.test(v.name))
      || enUSVoices.find(v => /siri/i.test(v.name))
      || enUSVoices.find(v => /samantha|nicky|ava|allison|victoria/i.test(v.name))
      || enUSVoices.find(v => /enhanced|premium/i.test(v.name))
      || enUSVoices[0]
      // Chrome network voices (higher quality than local)
      || enVoices.find(v => v.name === 'Google US English')
      // Any English voice
      || enVoices[0];
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      utteranceRef.current = null;
      setInterviewState(prev => prev === 'speaking' ? 'active' : prev);
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      setInterviewState(prev => prev === 'speaking' ? 'active' : prev);
    };
    utteranceRef.current = utterance;
    setInterviewState('speaking');
    speechSynthesis.speak(utterance);
  }, []);

  // Cancel TTS on unmount
  useEffect(() => {
    return () => cancelTts();
  }, []);

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, currentQuestion]);

  // On mount: check for saved pointer, fetch from backend or start new
  useEffect(() => {
    if (state?.resumeSessionId) {
      restoreFromBackend({ sessionId: state.resumeSessionId, status: 'active' });
      return;
    }

    if (!state?.resumeText || !state?.jobDescription) {
      navigate('/upload', { replace: true });
      return;
    }

    const key = getInterviewPointerKey(state.resumeText, state.jobDescription);
    lsKeyRef.current = key;

    if (state.startFresh) {
      clearStartRequestId(key);
      setInterviewState('setup');
      return;
    }

    const pointer = loadInterviewPointer(state.resumeText, state.jobDescription);
    if (pointer) {
      restoreFromBackend(pointer);
    } else {
      setInterviewState('setup');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restoreFromBackend(pointer: SavedInterviewPointer) {
    setInterviewState('loading');

    try {
      const session = await getSession(pointer.sessionId);

      setSessionId(session.sessionId);
      setConversation(session.conversation);
      setTimeLimit(session.timeLimit);
      setSessionKeyterms(session.keyterms ?? []);

      if (session.status === 'completed') {
        // Redirect to dedicated results page
        navigate(`/interview/results/${session.sessionId}`, { replace: true });
        return;
      } else {
        // Active session — recalculate timer
        const createdEpochMs = session.createdAtEpoch * 1000;
        startedAtRef.current = createdEpochMs;
        const now = Date.now();
        const elapsedSoFar = Math.floor((now - createdEpochMs) / 1000);

        if (elapsedSoFar >= session.timeLimit) {
          // Session expired while user was away — end it and redirect to results
          try {
            await endInterview({ sessionId: session.sessionId, endReason: 'timer_expired' });
          } catch {
            // best-effort
          }
          if (lsKeyRef.current) {
            saveInterviewPointer(lsKeyRef.current, { sessionId: session.sessionId, status: 'completed' });
          }
          navigate(`/interview/results/${session.sessionId}`, { replace: true });
          return;
        } else {
          setElapsed(elapsedSoFar);
          // Restore turn state from conversation
          const userTurns = session.conversation.filter(
            t => t.role === 'user' || t.role === 'candidate'
          ).length;
          const interviewerTurns = session.conversation.filter(isInterviewQuestionTurn).length;
          const restoredTotalQuestions = getPositiveNumber(session.totalQuestions)
            ?? getPositiveNumber(session.questionCount)
            ?? interviewerTurns;
          const restoredQuestionNumber = restoredTotalQuestions > 0
            ? Math.min(interviewerTurns, restoredTotalQuestions)
            : interviewerTurns;
          setTurnNumber(userTurns);
          setQuestionNumber(restoredQuestionNumber);
          setTotalQuestions(restoredTotalQuestions);
          const lastInterviewerTurn = [...session.conversation].reverse().find(t => t.role === 'interviewer');
          if (lastInterviewerTurn) {
            setCurrentQuestion(lastInterviewerTurn.content);
          }
          speakQuestion(lastInterviewerTurn?.content || '');

          timerRef.current = setInterval(() => {
            const secs = Math.floor((Date.now() - createdEpochMs) / 1000);
            setElapsed(secs);
            if (secs >= session.timeLimit) {
              clearInterval(timerRef.current);
            }
          }, 1000);
        }
      }
    } catch (err) {
      console.error('Failed to restore interview session:', err);
      // Backend fetch failed — clear stale pointer and start fresh
      if (isMissingInterviewSessionError(err)) {
        if (lsKeyRef.current) clearInterviewPointerKey(lsKeyRef.current);
        setInterviewState('setup');
        setError('Previous interview session was not found. You can start a new one.');
      } else {
        setInterviewState('setup');
        setError('Could not restore your interview. Please try again.');
      }
    }
  }

  function getStartRequestKey(baseKey: string) {
    return `${baseKey}__startRequestId`;
  }

  function getOrCreateStartRequestId(baseKey: string) {
    const key = getStartRequestKey(baseKey);
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;

    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  }

  function clearStartRequestId(baseKey: string) {
    sessionStorage.removeItem(getStartRequestKey(baseKey));
  }

  function initNewSession() {
    if (!state?.resumeText || !state?.jobDescription) return;
    if (startInFlightRef.current) return;

    const resumeText = state.resumeText;
    const jobDescription = state.jobDescription;
    const analysisId = state.analysisId;
    const fileName = state.fileName;
    const jobTitle = state.jobTitle;
    const matchScore = state.matchScore;

    startInFlightRef.current = true;
    setInterviewState('starting');
    let cancelled = false;

    async function init() {
      try {
        const clientRequestId = getOrCreateStartRequestId(lsKeyRef.current);

        const res: StartInterviewResponse = await startInterview({
          resumeText,
          jobDescription,
          interviewType: selectedType,
          clientRequestId,
          analysisId,
          fileName,
          jobTitle,
          matchScore,
        });

        if (cancelled) return;

        const now = Date.now();
        startedAtRef.current = now;

        const firstConversation: ConversationTurn[] = [{
          role: 'interviewer',
          content: res.question,
          timestamp: now,
        }];

        setSessionId(res.sessionId);
        setSessionKeyterms(res.keyterms ?? []);
        setCurrentQuestion(res.question);
        setQuestionNumber(firstConversation.filter(isInterviewQuestionTurn).length);
        setTotalQuestions(res.totalQuestions);
        setTimeLimit(res.timeLimit);
        setConversation(firstConversation);
        speakQuestion(res.question);

        saveInterviewPointer(lsKeyRef.current, {
          sessionId: res.sessionId,
          status: 'active',
        });

        clearStartRequestId(lsKeyRef.current);

        timerRef.current = setInterval(() => {
          const secs = Math.floor((Date.now() - now) / 1000);
          setElapsed(secs);
          if (secs >= res.timeLimit) {
            clearInterval(timerRef.current);
          }
        }, 1000);
      } catch (err) {
        if (cancelled) return;
        // Narrow axios error to detect the two paywall paths:
        //   429 + upgradeRequired:true        → daily interview quota hit
        //   403 + technical_interview_pro_only → technical mode is Pro-only
        // Mirror the response-shape pattern from Upload.tsx.
        const axiosErr = err as {
          response?: {
            status?: number;
            data?: { error?: string; upgradeRequired?: boolean };
          };
        };
        const status = axiosErr?.response?.status;
        const code = axiosErr?.response?.data?.error;
        const upgradeRequired = axiosErr?.response?.data?.upgradeRequired === true;

        if (status === 429 && upgradeRequired) {
          setUpgradeMessage(
            'Daily interview limit reached. Upgrade for 5 interviews per day with up to 10 questions each.',
          );
          setError('');
        } else if (status === 403 && code === 'technical_interview_pro_only') {
          setUpgradeMessage(
            'Technical interviews require Pro. Upgrade to practice both behavioral and technical.',
          );
          setError('');
        } else {
          const msg = err instanceof Error ? err.message : 'Failed to start interview';
          setError(msg);
        }
        setInterviewState('setup');
      } finally {
        startInFlightRef.current = false;
      }
    }

    init();

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      startInFlightRef.current = false;
    };
  }

  // Auto-end when timer expires
  useEffect(() => {
    if (timeLimit > 0 && elapsed >= timeLimit && (interviewState === 'active' || interviewState === 'thinking' || interviewState === 'speaking')) {
      handleEnd('timer_expired');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, timeLimit, interviewState]);

  // 2-minute warning — subtle audio beep
  useEffect(() => {
    const remaining = timeLimit - elapsed;
    if (timeLimit > 0 && remaining === 120 && !warnedAt2Min && interviewState !== 'completed') {
      setWarnedAt2Min(true);
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 440;
        gain.gain.value = 0.15;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      } catch {
        // AudioContext not available
      }
    }
  }, [elapsed, timeLimit, warnedAt2Min, interviewState]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(answerTimerRef.current);
    };
  }, []);

  // F3: auto-open the mic level meter on setup when permission was previously granted.
  // iOS Safari requires a user gesture for AudioContext, so we fall back to F2 there
  // (user must click "Test microphone" / "Recheck" — those are real gestures).
  useEffect(() => {
    if (interviewState !== 'setup') return;
    if (isIOS) return;
    if (microphoneCheck.status === 'ready' && micLevel.status !== 'active' && micLevel.status !== 'starting') {
      void micLevel.start();
    }
    return () => {
      micLevel.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewState, microphoneCheck.status, isIOS]);

  const handleSubmitAnswer = useCallback(async (answerText: string) => {
    const answer = answerText.trim();
    if (!answer || !sessionId) return;

    clearInterval(answerTimerRef.current);
    const answerDuration = answerStartRef.current > 0
      ? Math.floor((Date.now() - answerStartRef.current) / 1000)
      : null;
    answerStartRef.current = 0;
    setAnswerElapsed(0);

    const newTurn = turnNumber + 1;
    resetTranscript();
    setError('');
    setInterviewState('thinking');

    const submitPromise = submitTurn({
      sessionId,
      userAnswer: answer,
      turnNumber: newTurn,
    });
    submitInFlightRef.current = submitPromise;

    try {
      const res = await submitPromise;

      const nextQuestion = res.question?.trim();
      if (!nextQuestion) {
        throw new Error('The interviewer did not return a response. Please try your answer again.');
      }

      // Record answer duration only after the backend accepts the turn.
      if (answerDuration !== null) {
        setAnswerDurations(prev => [...prev, answerDuration]);
      }

      setTurnNumber(newTurn);

      const userTurn: ConversationTurn = {
        role: 'user',
        content: answer,
        timestamp: Date.now(),
        feedback: res.feedback,
        fillerWords: res.fillerWords,
      };

      const isClosingPrompt = isInterviewClosingPrompt(nextQuestion);
      setCurrentQuestion(nextQuestion);
      setQuestionNumber(prev => {
        const nextQuestionNumber = isClosingPrompt ? prev : prev + 1;
        return totalQuestions > 0 ? Math.min(nextQuestionNumber, totalQuestions) : nextQuestionNumber;
      });

      const aiTurn: ConversationTurn = {
        role: 'interviewer',
        content: nextQuestion,
        timestamp: Date.now(),
      };
      setConversation(prev => [...prev, userTurn, aiTurn]);
      speakQuestion(nextQuestion);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get next question';
      setError(msg);
      setInterviewState('active');
    } finally {
      if (submitInFlightRef.current === submitPromise) {
        submitInFlightRef.current = null;
      }
    }
  }, [sessionId, turnNumber, resetTranscript, speakQuestion, totalQuestions]);

  const handleEnd = useCallback(async (reason: 'user_ended' | 'timer_expired' | 'all_questions_answered') => {
    if (reason === 'user_ended' && interviewState === 'thinking') {
      setError('Your answer is still being processed. Wait for the interviewer response before ending.');
      return;
    }

    // If the timer fires (or last question completes) while a submit is still in flight,
    // await it unbounded — submitTurn p99 is ~10s and a truncated final answer is worse
    // than a few extra seconds on the spinner. Show a "Saving..." banner after 2s so the
    // user knows we're not frozen.
    if (submitInFlightRef.current) {
      const pending = submitInFlightRef.current;
      const savingTimer = window.setTimeout(() => setSavingFinalAnswer(true), 3000);
      try {
        await awaitPendingTurnSubmission(pending);
      } finally {
        window.clearTimeout(savingTimer);
        setSavingFinalAnswer(false);
      }
    }

    clearInterval(timerRef.current);
    clearInterval(answerTimerRef.current);
    if (answerStartRef.current > 0) {
      setAnswerElapsed(0);
    }
    answerStartRef.current = 0;
    pushToTalkActiveRef.current = false;
    activePointerIdRef.current = null;
    cancelTts();
    void stopListening();

    // Update pointer to completed
    if (lsKeyRef.current) {
      saveInterviewPointer(lsKeyRef.current, { sessionId, status: 'completed' });
    }
    try {
      sessionStorage.setItem(
        `resumematch_interview_finalizing_${sessionId}`,
        JSON.stringify({ endReason: reason, startedAt: Date.now() })
      );
    } catch {
      // Session storage can be unavailable in restricted browser contexts.
    }

    // Navigate to dedicated results page
    navigate(`/interview/results/${sessionId}`, {
      replace: true,
    });
  }, [interviewState, sessionId, stopListening, navigate]);

  const handlePushToTalkDown = useCallback(() => {
    if (
      (interviewState !== 'active' && interviewState !== 'speaking')
      || !isSupported
      || pushToTalkActiveRef.current
    ) {
      return false;
    }
    pushToTalkActiveRef.current = true;
    cancelTts();
    setInterviewState('active');
    // Start per-answer timer
    if (answerStartRef.current === 0) {
      answerStartRef.current = Date.now();
      setAnswerElapsed(0);
      answerTimerRef.current = setInterval(() => {
        setAnswerElapsed(Math.floor((Date.now() - answerStartRef.current) / 1000));
      }, 1000);
    }
    startListening(sessionId, sessionKeyterms);
    return true;
  }, [interviewState, isSupported, sessionId, sessionKeyterms, startListening]);

  const handlePushToTalkUp = useCallback(async () => {
    if (!pushToTalkActiveRef.current) return;
    pushToTalkActiveRef.current = false;
    const finalText = await stopListening();
    if (finalText) {
      handleSubmitAnswer(finalText);
    } else {
      clearInterval(answerTimerRef.current);
      answerStartRef.current = 0;
      setAnswerElapsed(0);
    }
  }, [stopListening, handleSubmitAnswer]);

  const handlePushToTalkPointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    if (!handlePushToTalkDown()) return;
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture may fail if the pointer is already released.
    }
  }, [handlePushToTalkDown]);

  const handlePushToTalkPointerUp = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) return;
    e.preventDefault();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Browser may have already released capture.
    }
    activePointerIdRef.current = null;
    void handlePushToTalkUp();
  }, [handlePushToTalkUp]);

  // Keyboard: hold Space to speak
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      if (!e.repeat && (interviewState === 'active' || interviewState === 'speaking') && !pushToTalkActiveRef.current) {
        handlePushToTalkDown();
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      if (pushToTalkActiveRef.current) {
        void handlePushToTalkUp();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [interviewState, handlePushToTalkDown, handlePushToTalkUp]);

  const handleStartClick = useCallback(async () => {
    const s = microphoneCheck.status;
    if (s === 'checking' || s === 'error') return;
    if (s === 'permission-needed' || s === 'idle') {
      const ok = await micLevel.start();
      if (!ok) {
        // Surface the failure in the mic card (will flip to error state).
        void microphoneCheck.requestPermission();
        return;
      }
      void microphoneCheck.recheck();
    }
    micLevel.stop();
    // Yield a frame so AudioContext.close() flushes before Deepgram acquires a fresh stream.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    initNewSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphoneCheck.status, micLevel]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const remaining = Math.max(0, timeLimit - elapsed);
  const activeError = error || speechError;
  const controls = getInterviewControlState({
    currentQuestion,
    interviewState,
    isListening,
    isArming,
  });
  const currentPromptIsClosing = controls.isClosingPrompt;
  const questionProgressLabel = currentPromptIsClosing
    ? 'All questions complete'
    : totalQuestions > 0
    ? `Question ${questionNumber} of ${totalQuestions}`
    : `Question ${questionNumber || 1}`;

  // --- Render ---

  if (interviewState === 'starting' || interviewState === 'loading') {
    return (
      <div className="page-container">
        <div className="interview-loading">
          <div className="loading-spinner" />
          <h2>{interviewState === 'loading' ? 'Loading interview' : 'Preparing your interview'}</h2>
          <p className="text-secondary">
            {interviewState === 'loading'
              ? 'Fetching your previous session...'
              : 'Generating questions based on your resume and the job description...'}
          </p>
        </div>
      </div>
    );
  }

  if (interviewState === 'setup') {
    return (
      <div className="page-container interview-setup-page">
        <div className="interview-setup animate-in">
          <button type="button" className="interview-setup__back" onClick={() => navigate(-1)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to results
          </button>

          <div className="interview-setup__card card">
            <div className="interview-setup__icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="6" y="2" width="16" height="20" rx="8" stroke="currentColor" strokeWidth="2" />
                <path d="M4 14c0 5.5 4.5 10 10 10s10-4.5 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M14 24v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>

            <h1 className="interview-setup__title">Mock Interview</h1>
            <div className="interview-setup__context">
              <span>Interviewing for</span>
              <strong>{setupJobTitle}</strong>
            </div>
            <p className="interview-setup__subtitle">
              Practice a realistic interview tailored to this role, with live follow-up questions and instant feedback.
            </p>

            {upgradeMessage && (
              <UpgradePrompt message={upgradeMessage} cta="Upgrade to Pro" />
            )}

            {error && (
              <div className="interview-error" style={{ marginBottom: '1rem' }}>
                <p>{error}</p>
              </div>
            )}

            <div className="interview-setup__type">
              <label className="interview-setup__label">Choose Format</label>
              <div className="interview-setup__toggle">
                <button
                  type="button"
                  className={`interview-setup__option ${selectedType === 'behavioral' ? 'interview-setup__option--active' : ''}`}
                  onClick={() => { setSelectedType('behavioral'); setUpgradeMessage(null); }}
                >
                  <span className="interview-setup__option-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M3 17c0-3.5 3-5.5 7-5.5s7 2 7 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="interview-setup__option-text">
                    <strong>Behavioral</strong>
                    <span>STAR-based questions about past experience</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`interview-setup__option ${selectedType === 'technical' ? 'interview-setup__option--active' : ''}`}
                  onClick={() => { setSelectedType('technical'); setUpgradeMessage(null); }}
                >
                  <span className="interview-setup__option-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M6 6L2 10l4 4M14 6l4 4-4 4M11.5 3l-3 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="interview-setup__option-text">
                    <strong>Technical</strong>
                    <span>System design and problem-solving questions</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="interview-setup__mic">
              <label className="interview-setup__label">Microphone</label>

              {microphoneCheck.status === 'permission-needed' && (
                <div className="interview-mic-check interview-mic-check--neutral">
                  <div className="interview-mic-check__icon">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="6.5" y="2" width="5" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M4 9.5c0 2.75 2.25 5 5 5s5-2.25 5-5M9 14.5V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="interview-mic-check__body">
                    <strong>Microphone access needed</strong>
                    <p>Click below to allow microphone access and see your input level.</p>
                    <button
                      type="button"
                      className="interview-mic-check__action"
                      onClick={async () => {
                        const ok = await micLevel.start();
                        if (ok) {
                          void microphoneCheck.recheck();
                        } else {
                          void microphoneCheck.requestPermission();
                        }
                      }}
                    >
                      Test microphone
                    </button>
                  </div>
                </div>
              )}

              {(microphoneCheck.status === 'idle' || microphoneCheck.status === 'checking') && (
                <div className="interview-mic-check interview-mic-check--neutral">
                  <div className="interview-mic-check__spinner" />
                  <div className="interview-mic-check__body">
                    <strong>Detecting microphone...</strong>
                    <p>Checking your current input device.</p>
                  </div>
                </div>
              )}

              {microphoneCheck.status === 'ready' && microphoneCheck.defaultMicKind === 'bluetooth' && (
                <div className="interview-mic-check interview-mic-check--warning" aria-live="polite">
                  <div className="interview-mic-check__icon">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M9 2l7 13H2L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      <path d="M9 6.25v4M9 13.25h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="interview-mic-check__body">
                    <strong>Bluetooth headphones detected ({microphoneCheck.defaultMicLabel})</strong>
                    <p>
                      Bluetooth microphones use a low-quality audio codec that can reduce transcription accuracy on technical terms. For best results, switch to your laptop&apos;s built-in microphone in your system sound settings, then recheck.
                    </p>
                    <MicLevelMeter bins={micLevel.bins} active={micLevel.status === 'active'} />
                    <button
                      type="button"
                      className="interview-mic-check__action"
                      onClick={() => void microphoneCheck.recheck()}
                    >
                      Recheck
                    </button>
                  </div>
                </div>
              )}

              {microphoneCheck.status === 'ready' && microphoneCheck.defaultMicKind !== 'bluetooth' && (
                <div className="interview-mic-check interview-mic-check--ok">
                  <div className="interview-mic-check__icon">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M15 5L7.5 12.5 3 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="interview-mic-check__body">
                    <strong>{microphoneCheck.defaultMicLabel ?? 'Microphone detected'}</strong>
                    <p>{microphoneCheck.defaultMicKind === 'wired' ? 'Speak to test — bars should move when sound is detected.' : 'Speak to test — bars should move when sound is detected.'}</p>
                    <MicLevelMeter bins={micLevel.bins} active={micLevel.status === 'active'} />
                    <button
                      type="button"
                      className="interview-mic-check__action"
                      onClick={() => void microphoneCheck.recheck()}
                    >
                      Recheck
                    </button>
                  </div>
                </div>
              )}

              {microphoneCheck.status === 'error' && (
                <div className="interview-mic-check interview-mic-check--error">
                  <div className="interview-mic-check__icon">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M9 5.5v4M9 12.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="interview-mic-check__body">
                    <strong>Microphone access required</strong>
                    <p>{microphoneCheck.error ?? 'Could not detect your microphone.'} Allow microphone access in your browser settings, then click Recheck.</p>
                    <button
                      type="button"
                      className="interview-mic-check__action"
                      onClick={() => void microphoneCheck.recheck()}
                    >
                      Recheck
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              className="btn btn-primary interview-setup__start"
              onClick={handleStartClick}
              disabled={microphoneCheck.status === 'checking' || microphoneCheck.status === 'error'}
            >
              Start Interview
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M8 3.5L11 7 8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className="interview-setup__meta">
              <span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M6 3v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
                25 min session
              </span>
              <span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 3h10M1 6h6M1 9h8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
                Full transcript
              </span>
              <span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v3l2 1M1 7.5a5 5 0 009.5 0M.5 5a5 5 0 019.5-2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
                Instant feedback
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active / Thinking
  return (
    <div className="page-container">
      <div className="interview-header animate-in">
        <div>
          <h1>Mock Interview</h1>
          <p className="text-secondary">{questionProgressLabel}</p>
        </div>
        <div className="interview-timer">
          <span className={`interview-timer__value ${remaining <= 120 ? 'interview-timer__value--warning' : ''}`}>
            {formatTime(remaining)}
          </span>
          <span className="interview-timer__label">remaining</span>
          {(answerElapsed > 0 || answerDurations.length > 0) && (
            <div className="interview-timer__stats">
              {answerElapsed > 0 && (
                <span className="interview-timer__answer">
                  {formatTime(answerElapsed)}
                </span>
              )}
              {answerDurations.length > 0 && (
                <span className="interview-timer__avg">
                  avg {formatTime(Math.round(answerDurations.reduce((a, b) => a + b, 0) / answerDurations.length))}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`interview-question card animate-in stagger-1${interviewState === 'speaking' ? ' interview-question--speaking' : ''}`}>
        <div className="interview-question__avatar">
          {interviewState === 'speaking' ? (
            <div className="interview-speaking-bars">
              <span /><span /><span /><span />
            </div>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 17.5c0-3.5 3-5.5 7-5.5s7 2 7 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </div>
        {interviewState === 'thinking' ? (
          <div className="interview-thinking">
            <span className="interview-thinking__dot" />
            <span className="interview-thinking__dot" />
            <span className="interview-thinking__dot" />
          </div>
        ) : (
          <p className="interview-question__text">{currentQuestion}</p>
        )}
      </div>

      {activeError && (
        <div className="interview-error animate-in" role="alert">
          <p>{activeError}</p>
        </div>
      )}

      {savingFinalAnswer && (
        <div className="interview-saving animate-in" role="status" aria-live="polite">
          <span className="loading-spinner interview-saving__spinner" />
          <span>Saving your last answer...</span>
        </div>
      )}

      {(isListening || isArming) && (
        <div className="interview-answer card animate-in interview-answer--recording">
          <span className="interview-answer__label">{isArming ? 'Connecting mic...' : 'Listening...'}</span>
        </div>
      )}

      <div className="interview-controls">
        <button
          type="button"
          className={`interview-mic ${controls.micActive ? 'interview-mic--active' : ''}`}
          onPointerDown={handlePushToTalkPointerDown}
          onPointerUp={handlePushToTalkPointerUp}
          onPointerCancel={handlePushToTalkPointerUp}
          disabled={controls.micDisabled}
          aria-label={currentPromptIsClosing ? 'Interview questions complete' : 'Hold to speak'}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="8" y="2" width="8" height="12" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M5 11c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 18v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {controls.micActive ? <span className="interview-mic__pulse" /> : null}
        </button>
        <p className="interview-controls__hint">
          {controls.hint}
        </p>
        <div className="interview-controls__row">
          <button
            type="button"
            className={`btn btn-ghost interview-tts-toggle ${ttsEnabled ? '' : 'interview-tts-toggle--off'}`}
            onClick={toggleTts}
            title={ttsEnabled ? 'Mute interviewer voice' : 'Unmute interviewer voice'}
          >
            {ttsEnabled ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 5.5h2.5L8 2v12L4.5 10.5H2a1 1 0 01-1-1v-3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M11 4.5c1.2 1 2 2.1 2 3.5s-.8 2.5-2 3.5M10 6.5c.6.5 1 1 1 1.5s-.4 1-1 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 5.5h2.5L8 2v12L4.5 10.5H2a1 1 0 01-1-1v-3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M11 5.5l4 5M15 5.5l-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            className={`btn ${currentPromptIsClosing ? 'btn-primary' : 'btn-ghost'} interview-end-btn`}
            onClick={() => handleEnd(controls.endReason)}
            disabled={controls.endDisabled}
          >
            {controls.endButtonLabel}
          </button>
        </div>
      </div>

      <div ref={conversationEndRef} />
    </div>
  );
}

function MicLevelMeter({ bins, active }: { bins: number[]; active: boolean }) {
  return (
    <div className={`mic-meter ${active ? 'mic-meter--active' : ''}`} aria-hidden="true">
      {bins.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(8, Math.round(v * 100))}%` }} />
      ))}
    </div>
  );
}
