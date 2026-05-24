# Entitlement limit constants — Python source-of-truth MIRROR.
#
#   TS source of truth : src/utils/entitlements.ts   (FREE_LIMITS / PRO_LIMITS)
#   Drift test         : src/utils/entitlements-drift.test.ts
#                        (compares this file to the TS exports; `npm test` fails
#                         on ANY divergence in key set or value)
#
# Paste into every enforcement Lambda's inline helpers on edit
#   (Lambdas: generatePresignedUrl, analyzeResume, interviewStart,
#             interviewTurn, interviewEnd, getAnalysisHistory).
#
# Pure data. No imports, no logic. Keys + values MUST match the TS exports
# byte-for-byte — silent drift here is a release-blocking paywall bug.

FREE_LIMITS = {
    "analysesPerDay": 2,
    "interviewsPerDay": 1,
    "interviewQuestions": 5,
    "historyVisibleRows": 5,
    "features": {
        "categoryExplanations": False,
        "fullMissingKeywords": False,
        "rewriteSuggestions": False,
        "sideBySideDiff": False,
        "docxExport": False,
        "technicalInterview": False,
        "followUpQuestions": False,
        "perTurnFeedback": False,
        "transcriptExport": False,
        "fullAssessment": False,
    },
}

# pro_monthly and pro_sprint share identical limits (Free-pro-tier.md §2.2).
PRO_LIMITS = {
    "analysesPerDay": 10,
    "interviewsPerDay": 5,
    "interviewQuestions": 10,
    "historyVisibleRows": 500,
    "features": {
        "categoryExplanations": True,
        "fullMissingKeywords": True,
        "rewriteSuggestions": True,
        "sideBySideDiff": True,
        "docxExport": True,
        "technicalInterview": True,
        "followUpQuestions": True,
        "perTurnFeedback": True,
        "transcriptExport": True,
        "fullAssessment": True,
    },
}
