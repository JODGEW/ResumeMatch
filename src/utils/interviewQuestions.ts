type InterviewTurnLike = {
  role: string;
  content: string;
};

export function isInterviewClosingPrompt(content: string): boolean {
  const normalized = content
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.includes("that's all the questions i have")
    && normalized.includes('end interview')
    && normalized.includes('assessment')
    && normalized.includes('transcript');
}

export function isInterviewQuestionTurn(turn: InterviewTurnLike): boolean {
  return turn.role === 'interviewer' && !isInterviewClosingPrompt(turn.content);
}
