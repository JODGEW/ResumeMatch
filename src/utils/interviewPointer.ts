const LS_PREFIX = 'resumematch_interview_';

// Thin pointer stored in localStorage — no conversation data
export interface SavedInterviewPointer {
  sessionId: string;
  status: 'active' | 'completed';
}

function hashInputs(resumeText: string, jobDescription: string): string {
  let hash = 0;
  const str = resumeText + '|||' + jobDescription;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function getInterviewPointerKey(resumeText: string, jobDescription: string): string {
  return LS_PREFIX + hashInputs(resumeText, jobDescription);
}

export function saveInterviewPointer(key: string, data: SavedInterviewPointer) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage full or unavailable
  }
}

export function clearInterviewPointerKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable
  }
}

export function clearInterviewPointer(resumeText: string, jobDescription: string) {
  clearInterviewPointerKey(getInterviewPointerKey(resumeText, jobDescription));
}

export function loadInterviewPointer(resumeText: string, jobDescription: string): SavedInterviewPointer | null {
  try {
    const raw = localStorage.getItem(getInterviewPointerKey(resumeText, jobDescription));
    if (!raw) return null;
    const pointer = JSON.parse(raw);
    if (
      !pointer
      || typeof pointer.sessionId !== 'string'
      || (pointer.status !== 'active' && pointer.status !== 'completed')
    ) {
      clearInterviewPointer(resumeText, jobDescription);
      return null;
    }
    return pointer;
  } catch {
    return null;
  }
}
