import jaroWinkler from 'talisman/metrics/jaro-winkler';

// Conservative post-STT correction for the mock-interview batch transcript.
//
// Deepgram Nova-3 occasionally garbles technical terms (e.g. "Databricks" ->
// "data brix"). This module recovers them — but a false correction that rewrites
// a real word is far worse than a leftover mis-hearing, so every replacement
// passes strict gates and the default posture is to leave text alone.
//
// Real-interview testing surfaced meaning-changing false positives ("It" -> "OAuth",
// "reaches to" -> "ReAct") that drove the gates tighter: Jaro-Winkler is now the
// SOLE trigger (metaphone equality no longer fires), the target-length floor is
// >= 6 chars (kills OAuth/Kafka/Nginx/ReAct), and any single common English word
// is never corrected at any confidence.
//
// FRONTEND ONLY. Pure functions, no I/O, no backend calls.

export interface TranscriptWord {
  /** Display form of the token (Deepgram's punctuated_word when available). */
  word: string;
  /** Per-word confidence in [0, 1]. */
  confidence: number;
}

// Matcher targets that are not session-specific. Added to the session keyterms as
// Layer-1 correction targets ONLY — never sent to Deepgram (that curated keyterm
// prompt is capped separately to avoid forced matches). Every entry is >= 6 chars
// on purpose; anything shorter is inert under the target-length floor, which is
// why OAuth/Kafka/Nginx (5) and gRPC/CORS/REST/S3 don't belong here.
const UNIVERSAL_SUPPLEMENT = [
  'GraphQL',
  'Kubernetes',
  'PostgreSQL',
  'Elasticsearch',
  'RabbitMQ',
  'Terraform',
  'WebSocket',
  'Cassandra',
  'Prometheus',
  'Grafana',
  'Ansible',
  'Jenkins',
];

// Layer 2: whole-phrase, case-insensitive replacement of nonsense mis-hearings.
// The left side is NOT a real word, so there is no confidence gate. Grow this
// ONLY when a recurring nonsense mis-hearing is actually observed.
const NONSENSE_ALIASES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bwrestlemania\b/gi, replacement: 'ResumeMatch' },
  { pattern: /\bwrestle\s+mania\b/gi, replacement: 'ResumeMatch' },
  { pattern: /\bwrestle\s+match\b/gi, replacement: 'ResumeMatch' },
];

// Layer-1 gates / thresholds.
const CONFIDENCE_GATE = 0.6; // replace only when window confidence is below this
const JARO_WINKLER_THRESHOLD = 0.9; // the SOLE phonetic trigger; do not raise above 0.92
const MIN_TARGET_LENGTH = 6; // normalized canonical target must be at least this long
const MAX_WINDOW = 3; // slide windows of 1..3 tokens

/** Lowercase + strip everything but [a-z0-9] for edit comparison. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface CanonicalTarget {
  /** Original casing — what we substitute in. */
  display: string;
  /** Normalized form used for matching. */
  norm: string;
}

function buildTargets(canonicalTerms: string[]): CanonicalTarget[] {
  const seen = new Set<string>();
  const targets: CanonicalTarget[] = [];

  for (const term of [...canonicalTerms, ...UNIVERSAL_SUPPLEMENT]) {
    const display = (term ?? '').trim();
    if (!display) continue;
    const norm = normalize(display);
    // Target-length floor: require >= 6 chars. Skips OAuth/Kafka/Nginx/ReAct/CORS/
    // REST/S3 and any short term that collides with ordinary speech.
    if (norm.length < MIN_TARGET_LENGTH) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    targets.push({ display, norm });
  }

  return targets;
}

interface Match {
  target: CanonicalTarget;
  score: number; // Jaro-Winkler similarity
}

/**
 * Best canonical match for a normalized window, or null if none clears the bar.
 * Jaro-Winkler is the only trigger — metaphone equality was removed because it
 * fired on short tokens and changed meaning ("It"/"at" -> "OAuth").
 */
function bestMatch(windowNorm: string, targets: CanonicalTarget[]): Match | null {
  let best: Match | null = null;

  for (const target of targets) {
    const jw = jaroWinkler(windowNorm, target.norm);
    if (jw >= JARO_WINKLER_THRESHOLD && (!best || jw > best.score)) {
      best = { target, score: jw };
    }
  }

  return best;
}

/** True when the window is a SINGLE token that is a common English word. */
function isSingleCommonWord(window: TranscriptWord[]): boolean {
  return window.length === 1 && COMMON_WORDS.has(normalize(window[0].word));
}

/** Trailing sentence punctuation on a token, so a replacement can keep it. */
function trailingPunctuation(token: string): string {
  const match = token.match(/([.,!?;:]+)$/);
  return match ? match[1] : '';
}

/**
 * Layer 1 — phonetic + confidence-gated matcher.
 *
 * Slides 1..3 token windows left-to-right. A window is replaced with a canonical
 * term ONLY when all of these hold:
 *   1. window confidence (the MINIMUM word confidence) < 0.60
 *   2. Jaro-Winkler(normalized window, normalized target) >= 0.90
 *   3. the normalized canonical target is >= 6 chars
 *   4. the window is not a single common English word (at any confidence)
 * When unsure, it leaves the text untouched.
 */
function applyPhoneticCorrection(words: TranscriptWord[], canonicalTerms: string[]): string {
  if (words.length === 0) return '';

  const targets = buildTargets(canonicalTerms);
  if (targets.length === 0) {
    return words.map((w) => w.word).join(' ');
  }

  const out: string[] = [];
  let i = 0;

  while (i < words.length) {
    let replaced = false;

    // Prefer the longest qualifying window so multi-token mis-hearings
    // ("resume chart" -> "ResumeMatch") win over a partial single-token match.
    for (let size = Math.min(MAX_WINDOW, words.length - i); size >= 1; size -= 1) {
      const window = words.slice(i, i + size);
      const windowConfidence = Math.min(...window.map((w) => w.confidence));

      // Gate 1: confidence.
      if (windowConfidence >= CONFIDENCE_GATE) continue;

      // Gate 4: never "correct" a single token that is a common English word.
      // Multi-token windows are intentionally exempt so "resume chart" still maps.
      if (isSingleCommonWord(window)) continue;

      const windowNorm = normalize(window.map((w) => w.word).join(' '));
      if (!windowNorm) continue;

      // Gates 2 (JW) & 3 (target length) are enforced inside bestMatch/buildTargets.
      const match = bestMatch(windowNorm, targets);
      if (!match) continue;

      const original = window.map((w) => w.word).join(' ');
      const punctuation = trailingPunctuation(window[window.length - 1].word);
      out.push(match.target.display + punctuation);

      console.info('[transcriptCorrection] layer1 replace', {
        original,
        confidence: Number(windowConfidence.toFixed(3)),
        matched: match.target.display,
        score: Number(match.score.toFixed(3)),
        via: 'jaro-winkler',
        layer: 1,
      });

      i += size;
      replaced = true;
      break;
    }

    if (!replaced) {
      out.push(words[i].word);
      i += 1;
    }
  }

  return out.join(' ');
}

/**
 * Layer 2 — tiny nonsense-alias map. Whole-phrase, case-insensitive, no
 * confidence gate (the left side is not a real word). Safe to run on any
 * transcript, including a streaming fallback with no per-word confidence, and
 * idempotent so it can run again on already-corrected text.
 */
export function applyNonsenseAliases(text: string): string {
  let result = text;
  for (const { pattern, replacement } of NONSENSE_ALIASES) {
    result = result.replace(pattern, (matched) => {
      console.info('[transcriptCorrection] layer2 replace', {
        original: matched,
        matched: replacement,
        layer: 2,
      });
      return replacement;
    });
  }
  return result;
}

/**
 * Full correction pipeline for the batch (per-word) path: Layer 1 then Layer 2.
 *
 * `words` are Deepgram's tokens ({ word, confidence }); `canonicalTerms` is the
 * FULL session keyterm array (not the curated 25-term Deepgram prompt). Pass an
 * empty `words` array to skip Layer 1 — Layer 2 then has nothing to operate on
 * (callers run applyNonsenseAliases directly on a string in that case). Never
 * throws when confidences are missing.
 */
export function correctTranscript(words: TranscriptWord[], canonicalTerms: string[]): string {
  const layer1 = applyPhoneticCorrection(words, canonicalTerms);
  return applyNonsenseAliases(layer1);
}

// The ~2000 most frequent English words, used by the single-token common-word
// guard so ordinary speech is never rewritten into a technical term. Generated
// offline from the frequency-ranked `popular-english-words` dataset (top 2000,
// lowercased, alphabetic only) and inlined to avoid pulling that package's full
// ~225k-word list into the frontend bundle. Includes function words (at, it, of,
// the, to, is, was, on, in) and common verb forms (reached, ...).
const COMMON_WORDS: ReadonlySet<string> = new Set([
  'the', 'of', 'in', 'and', 'to', 'a', 'is', 'was', 'on', 'as', 'for', 'by',
  'that', 'it', 'with', 'at', 'he', 'this', 'from', 'be', 'an', 'i', 'not', 'his',
  'are', 'or', 'which', 'has', 'but', 'were', 'have', 'also', 'one', 'page', 'you', 'no',
  'first', 'they', 'had', 'made', 'been', 'who', 'there', 'their', 'may', 'should', 'its', 'after',
  'all', 'nbsp', 'she', 'her', 'new', 'other', 'if', 'discussion', 'can', 'would', 'two', 'more',
  'about', 'such', 'do', 'when', 'some', 'time', 'only', 'into', 'so', 'during', 'up', 'then',
  'delete', 'where', 'out', 'than', 'used', 'most', 'over', 'link', 'january', 'march', 'born', 'september',
  'october', 'july', 'august', 'please', 'years', 'december', 'june', 'april', 'th', 'will', 'any', 'com',
  'what', 'november', 'being', 'these', 'people', 'between', 'we', 'following', 'many', 'february', 'him', 'like',
  'them', 'further', 'while', 'see', 'later', 'name', 'comments', 'school', 'part', 'under', 'just', 'year',
  'edits', 'well', 'use', 'debate', 'since', 'work', 'three', 'known', 'before', 'www', 'my', 'both',
  'state', 'style', 'film', 'now', 'through', 'because', 'group', 'including', 'american', 'user', 'align', 'city',
  'wikipedia', 'same', 'however', 'became', 'could', 'second', 'appropriate', 'world', 'above', 'team', 'articles', 'keep',
  'subsequent', 'your', 'closed', 'right', 'until', 'modify', 'left', 'against', 'states', 'talk', 'number', 'center',
  'don', 'series', 'list', 'album', 'included', 'several', 'family', 'redirect', 'season', 'very', 'united', 'found',
  'company', 'sources', 'area', 'below', 'here', 'history', 'me', 'played', 'how', 'even', 'per', 'won',
  'added', 'released', 'does', 'each', 'national', 'did', 'south', 'place', 'result', 'make', 'called', 'music',
  'best', 'those', 'another', 'think', 'section', 'note', 'support', 'based', 'way', 'former', 'game', 'member',
  'early', 'much', 'still', 'four', 'north', 'high', 'war', 'good', 'back', 'links', 'located', 'own',
  'government', 'university', 'around', 'end', 'notable', 'song', 'military', 'general', 'title', 'public', 'named', 'book',
  'published', 'said', 'image', 'show', 'day', 'long', 'deletion', 'information', 'due', 'local', 'house', 'main',
  'last', 'within', 'held', 'original', 'home', 'us', 'comment', 'major', 'life', 'different', 'died', 'club',
  'english', 'began', 'point', 'small', 'line', 'single', 'created', 'band', 'archive', 'took', 'get', 'served',
  'town', 'population', 'source', 'include', 'again', 'case', 'although', 'received', 'along', 'international', 'using', 'without',
  'system', 'members', 'proposed', 'station', 'built', 'age', 'top', 'century', 'set', 'having', 'british', 'given',
  'church', 'west', 'building', 'player', 'president', 'though', 'village', 'category', 'women', 'large', 'district', 'few',
  'need', 'preserved', 'order', 'children', 'species', 'service', 'find', 'overlap', 'bgcolor', 'archived', 'take', 'old',
  'times', 'know', 'country', 'death', 'research', 'according', 'moved', 'often', 'final', 'written', 'media', 'community',
  'third', 've', 'east', 'off', 'down', 'john', 'am', 'version', 'five', 'edit', 'every', 'son',
  'example', 'party', 'york', 'form', 'class', 'near', 'games', 'subject', 'go', 'others', 'among', 'site',
  'content', 'art', 'help', 'father', 'too', 'project', 'established', 'side', 'road', 'works', 'text', 'director',
  'career', 'various', 'notability', 'why', 'men', 'record', 'started', 'background', 'league', 'play', 'great', 'deleted',
  'french', 'award', 'never', 'enough', 'county', 'million', 'development', 'total', 'reason', 'law', 'thanks', 'next',
  'days', 'led', 'might', 'water', 'college', 'german', 'political', 'become', 'seems', 'rather', 'late', 'news',
  'head', 'already', 'either', 'little', 'editor', 'important', 'role', 'similar', 'making', 'came', 'went', 'white',
  'current', 'london', 'better', 'worked', 'issue', 'say', 'file', 'person', 'free', 'considered', 'man', 'story',
  'short', 'live', 'students', 'once', 'produced', 'period', 'least', 'black', 'something', 'power', 'present', 'business',
  'street', 'river', 'currently', 'married', 'production', 'reported', 'king', 'lead', 'six', 'done', 'education', 'press',
  'really', 'football', 'land', 'term', 'books', 'users', 'office', 'program', 'wrote', 'described', 'division', 'television',
  'change', 'involved', 'event', 'together', 'language', 'position', 'our', 'want', 'field', 'common', 'level', 'army',
  'data', 'working', 'park', 'fact', 'pages', 'professional', 'possible', 'founded', 'type', 'going', 'mentioned', 'young',
  'court', 'move', 'less', 'available', 'must', 'someone', 'full', 'joined', 'consensus', 'central', 'template', 'add',
  'announced', 'win', 'video', 'services', 'lost', 'taken', 'put', 'region', 'air', 'run', 'points', 'significant',
  'instead', 'author', 'recorded', 'review', 'probably', 'round', 'open', 'special', 'official', 'editors', 'policy', 'far',
  'actually', 'social', 'seen', 'returned', 'via', 'design', 'request', 'calculated', 'board', 'process', 'html', 'question',
  'records', 'character', 'originally', 'start', 'independent', 'close', 'wife', 'opened', 'england', 'look', 'events', 'elected',
  'release', 'related', 'listed', 'continued', 'addition', 'evidence', 'issues', 'areas', 'love', 'date', 'away', 'whether',
  'society', 'itself', 'radio', 'reliable', 'coverage', 'island', 'appeared', 'himself', 'popular', 'problem', 'across', 'western',
  'department', 'council', 'upon', 'control', 'appointed', 'months', 'able', 'includes', 'ratio', 'previous', 'come', 'modern',
  'teams', 'references', 'match', 'track', 'living', 'appears', 'course', 'episode', 'mother', 'artist', 'science', 'featured',
  'provide', 'things', 'usually', 'shows', 'force', 'northern', 'body', 'songs', 'developed', 'sure', 'players', 'america',
  'space', 'tv', 'refer', 'red', 'report', 'formed', 'means', 'nothing', 'directed', 'daughter', 'read', 'almost',
  'search', 'association', 'australia', 'give', 'act', 'material', 'playing', 'despite', 'police', 'minister', 'removed', 'human',
  'nominated', 'construction', 'post', 'provided', 'india', 'changed', 'today', 'race', 'signed', 'thus', 'real', 'none',
  'writing', 'stage', 'southern', 'coach', 'personal', 'professor', 'study', 'schools', 'outside', 'primary', 'website', 'debut',
  'throughout', 'makes', 'health', 'performed', 'especially', 'word', 'groups', 'features', 'future', 'designed', 'etc', 'view',
  'france', 'size', 'sold', 'training', 'organization', 'yet', 'strong', 'completed', 'mdash', 'championship', 'clear', 'multiple',
  'average', 'anything', 'ever', 'studies', 'light', 'week', 'username', 'create', 'needs', 'range', 'cover', 'eventually',
  'return', 'reached', 'action', 'gave', 'color', 'changes', 'canada', 'forces', 'countries', 'japanese', 'interest', 'museum',
  'magazine', 'followed', 'previously', 'half', 'always', 'writer', 'chief', 'topic', 'got', 'brother', 'generally', 'awarded',
  'thought', 'committee', 'rights', 'hall', 'individual', 'seven', 'images', 'largest', 'sometimes', 'past', 'election', 'performance',
  'particular', 'stated', 'collection', 'block', 'believe', 'leading', 'private', 'likely', 'big', 'killed', 'politician', 'active',
  'en', 'account', 'union', 'says', 'jan', 'label', 'specific', 'william', 'australian', 'promoted', 'idea', 'additional',
  'films', 'european', 'indian', 'james', 'reference', 'finished', 'placed', 'perhaps', 'rule', 'whose', 'europe', 'lot',
  'merge', 'soon', 'fire', 'simply', 'competition', 'standard', 'afded', 'edition', 'let', 'model', 'leader', 'contains',
  'germany', 'google', 'mar', 'replaced', 'value', 'night', 'route', 'low', 'centre', 'appear', 'actor', 'gold',
  'civil', 'degree', 'attack', 'female', 'royal', 'awards', 'results', 'front', 'thing', 'editing', 'parts', 'vote',
  'remained', 'yes', 'novel', 'taking', 'required', 'summer', 'sent', 'quality', 'studio', 'eastern', 'prior', 'uploaded',
  'ten', 'rock', 'dec', 'problems', 'china', 'names', 'middle', 'car', 'cases', 'sports', 'oct', 'longer',
  'terms', 'try', 'words', 'singer', 'agree', 'dr', 'officer', 'quite', 'seem', 'tour', 'bar', 'aircraft',
  'network', 'saw', 'operations', 'woman', 'medical', 'david', 'decided', 'historical', 'eight', 'complete', 'overlaps', 'meet',
  'lower', 'saying', 'behind', 'beginning', 'location', 'nov', 'lake', 'japan', 'bit', 'vocals', 'library', 'didn',
  'true', 'towards', 'recent', 'capital', 'noted', 'brought', 'apr', 'producer', 'copyright', 'senior', 'fourth', 'earlier',
  'anyone', 'limited', 'mean', 'management', 'jun', 'characters', 'nomination', 'allowed', 'george', 'industry', 'access', 'whole',
  'certain', 'cannot', 'guitar', 'particularly', 'sep', 'systems', 'tournament', 'arts', 'festival', 'attended', 'chinese', 'ship',
  'categories', 'child', 'base', 'railway', 'cup', 'online', 'san', 'green', 'student', 'successful', 'campaign', 'genus',
  'higher', 'culture', 'separate', 'aug', 'therefore', 'technology', 'movement', 'regular', 'introduced', 'money', 'artists', 'russian',
  'needed', 'approximately', 'mostly', 'rest', 'hours', 'structure', 'ground', 'canadian', 'plays', 'italian', 'trying', 'entire',
  'market', 'status', 'success', 'matter', 'sound', 'practice', 'claim', 'numerous', 'buildings', 'owned', 'whom', 'hand',
  'institute', 'battle', 'star', 'winning', 'uses', 'legal', 'commercial', 'feb', 'associated', 'spanish', 'notice', 'mark',
  'native', 'unit', 'represented', 'families', 'decision', 'units', 'doing', 'border', 'companies', 'web', 'lack', 'met',
  'hit', 'covered', 'famous', 'net', 'manager', 'overall', 'staff', 'response', 'month', 'initially', 'looking', 'natural',
  'accounts', 'feel', 'shown', 'feature', 'themselves', 'hospital', 'minor', 'attempt', 'blue', 'running', 'property', 'clearly',
  'length', 'traditional', 'medal', 'leave', 'call', 'experience', 'bridge', 'test', 'else', 'thomas', 'movie', 'spent',
  'journal', 'bank', 'opinion', 'pagename', 'jul', 'row', 'california', 'scope', 'sea', 'regional', 'foundation', 'majority',
  'runs', 'annual', 'care', 'rowspan', 'takes', 'food', 'robert', 'paris', 'energy', 'bad', 'musical', 'federal',
  'lived', 'asked', 'recording', 'speedy', 'mr', 'recently', 'deal', 'meaning', 'foreign', 'intended', 'selected', 'finally',
  'executive', 'presented', 'goal', 'lt', 'kind', 'retired', 'nature', 'sense', 'wiki', 'stop', 'conference', 'ended',
  'mention', 'lines', 'supported', 'starting', 'index', 'adding', 'opening', 'africa', 'raised', 'studied', 'comes', 'claims',
  'understand', 'directly', 'appearance', 'defeated', 'blocked', 'resolves', 'master', 'entry', 'tracks', 'square', 'plan', 'fails',
  'wide', 'room', 'sun', 'coast', 'places', 'scores', 'turn', 'launched', 'weeks', 'peak', 'except', 'governor',
  'economic', 'contract', 'kingdom', 'hill', 'looks', 'grand', 'captain', 'fair', 'fine', 'michael', 'key', 'preceding',
  'loss', 'global', 'php', 'seat', 'winner', 'older', 'wrong', 'assistant', 'hard', 'becoming', 'paul', 'activities',
  'ran', 'remains', 'highest', 'scored', 'theory', 'religious', 'friend', 'till', 'matches', 'minutes', 'claimed', 'cultural',
  'caused', 'newspaper', 'trade', 'secondary', 'thank', 'candidate', 'unless', 'oppose', 'academic', 'brown', 'complex', 'subsequently',
  'allow', 'plant', 'larger', 'actress', 'meeting', 'provides', 'washington', 'completely', 'write', 'historic', 'stories', 'charles',
  'gives', 'effect', 'channel', 'fall', 'passed', 'cause', 'programs', 'serving', 'colspan', 'goals', 'pass', 'ip',
  'referred', 'failed', 'useful', 'reasons', 'theatre', 'god', 'operated', 'admin', 'entered', 'leaving', 'competed', 'numbers',
  'languages', 'security', 'friends', 'tried', 'chairman', 'attention', 'command', 'notes', 'sister', 'reviews', 'ed', 'rules',
  'wanted', 'details', 'parties', 'municipality', 'continue', 'couple', 'paper', 'code', 'christian', 'suggest', 'purpose', 'computer',
  'mainly', 'creation', 'mary', 'shot', 'gets', 'format', 'exist', 'province', 'relationship', 'husband', 'relevant', 'nearly',
  'al', 'mountain', 'financial', 'nom', 'variety', 'highly', 'regarding', 'knowledge', 'basis', 'fellow', 'solid', 'academy',
  'kept', 'smith', 'maybe', 'operation', 'silver', 'et', 'mission', 'parents', 'score', 'valley', 'cd', 'focus',
  'projects', 'male', 'peter', 'latter', 'necessary', 'albums', 'formerly', 'secretary', 'african', 'votes', 'reading', 'nine',
  'youth', 'engineering', 'forms', 'map', 'seasons', 'victory', 'sir', 'individuals', 'dead', 'told', 'goes', 'believed',
  'increased', 'software', 'z', 'function', 'engine', 'edited', 'champion', 'remaining', 'table', 'earth', 'renamed', 'amount',
  'expanded', 'consider', 'otherwise', 'job', 'lives', 'lists', 'fight', 'volume', 'ireland', 'serve', 'correct', 'zealand',
  'getting', 'products', 'direct', 'helped', 'composed', 'le', 'cities', 'simple', 'face', 'cast', 'moving', 'rate',
  'figure', 'accepted', 'inside', 'forced', 'train', 'increase', 'voice', 'rank', 'immediately', 'https', 'turned', 'htm',
  'statement', 'difficult', 'bill', 'declined', 'beyond', 'questions', 'hope', 'picture', 'commission', 'ancient', 'info', 'cited',
  'poor', 'miles', 'judge', 'stone', 'ships', 'italy', 'consists', 'remove', 'earned', 'target', 'van', 'graduated',
  'stations', 'ago', 'pp', 'featuring', 'cross', 'henry', 'possibly', 'displayed', 'mm', 'census', 'digital', 'primarily',
  'stars', 'mind', 'navy', 'product', 'heart', 'surface', 'los', 'box', 'chart', 'offered', 'acquired', 'catholic',
  'criteria', 'creating', 'proded', 'specifically', 'concept', 'positive', 'potential', 'encyclopedia', 'tell', 'address', 'alone', 'check',
  'responsible', 'sites', 'certainly', 'pretty', 'discovered', 'giving', 'dance', 'elements', 'branch', 'era', 'technical', 'prime',
  'contributions', 'existing', 'host', 'temple', 'houses', 'literature', 'administration', 'situation', 'carried', 'width', 'prize', 'speed',
  'coming', 'broadcast', 'nor', 'roman', 'influence', 'richard', 'sentence', 'letter', 'suggested', 'domain', 'cut', 'el',
  'hold', 'administrative', 'examples', 'upper', 'ask', 'cost', 'actual', 'ones', 'commander', 'reporting', 'acting', 'conditions',
  'russia', 'ability', 'additions', 'marriage', 'scientific', 'extended', 'owner', 'internet', 'nearby', 'bay', 'prominent', 'basic',
  'becomes', 'bass', 'republic', 'follows', 'justice', 'reports', 'parliament', 'approach', 'founder', 'quickly', 'greek', 'airport',
  'cfded', 'dedicated', 'dispute', 'lies', 'answer', 'widely', 'plans', 'direction', 'income', 'commonly', 'mount', 'singles',
  'soviet', 'linked', 'irish', 'typically', 'initial', 'highway', 'basketball', 'contemporary', 'jewish', 'constructed', 'girl', 'mayor',
  'settlement', 'managed', 'spring', 'context', 'smaller', 'scene', 'critical', 'issued', 'types', 'unknown', 'troops', 'episodes',
  'tag', 'mass', 'photo', 'bishop', 'hotel', 'piano', 'sign', 'argument', 'fifth', 'parent', 'everything', 'description',
  'improve', 'politics', 'avoid', 'produce', 'dark', 'flight', 'ga', 'heavy', 'analysis', 'publication', 'physical', 'participated',
  'external', 'daily', 'titles', 'usa', 'mexico', 'oil', 'twice', 'engineer', 'follow', 'officially', 'meets', 'levels',
  'lord', 'greater', 'discuss', 'teacher', 'transferred', 'importance', 'merged', 'queen', 'entirely', 'activity', 'fully', 'involving',
  'bring', 'junior', 'vol', 'efforts', 'reach', 'faith', 'officers', 'girls', 'dutch', 'shortly', 'solo', 'composer',
  'root', 'establish', 'nation', 'leaves', 'chicago', 'agreed', 'remain', 'soldiers', 'castle', 'males', 'serves', 'appearances',
  'display', 'rural', 'applied', 'publishing', 'method', 'easily', 'marked', 'standards', 'everyone', 'hosted', 'copy', 'fefefe',
  'territory', 'britain', 'equipment', 'gallery', 'normal', 'prince', 'piece', 'conflict', 'forest', 'effort', 'worth', 'texas',
  'effects', 'split', 'camp', 'actions', 'interested', 'estate', 'treatment', 'build', 'hits', 'regiment', 'sort', 'draft',
  'workers', 'baseball', 'resources', 'campus', 'alongside', 'port', 'der', 'attacks', 'policies', 'fixed', 'residents', 'firm',
  'crew', 'drama', 'compared', 'authority', 'females', 'painting', 'parish', 'concerns', 'protection', 'agreement', 'assembly', 'join',
  'largely', 'poland', 'grew', 'spain', 'count', 'copies', 'tower', 'poet', 'roles', 'meant', 'nominator', 'hour',
  'arrived', 'distance', 'travel', 'die', 'providing', 'unique', 'double', 'exactly', 'elections', 'capacity', 'creek', 'wall',
  'guidelines', 'organizations', 'winter', 'store', 'brothers', 'conducted', 'championships', 'alternative', 'expected', 'forward', 'tree', 'resolution',
  'impact', 'sections', 'birth', 'publications', 'paid', 'recognized', 'exists', 'martin', 'islands', 'divided', 'confirmed', 'interview',
  'titled', 'ways', 'organized', 'operating', 'continues', 'serious', 'congress', 'views', 'drive', 'growth', 'message', 'combined',
  'versions', 'leaders', 'pay', 'charge', 'mixed', 'deputy', 'es', 'accept', 'environment', 'trial', 'share', 'offer',
  'educational', 'carolina', 'assigned', 'posted', 'defined', 'joseph', 'planned', 'revealed', 'latin', 'apparently', 'identified', 'housing',
  'understanding', 'summary', 'des', 'leadership', 'principal', 'bottom', 'offers', 'clubs', 'ice', 'indeed', 'urban', 'advanced',
  'heard', 'headquarters', 'destroyed', 'covers', 'communities', 'purchased', 'interesting', 'laws', 'peace', 'flag', 'journalist', 'sales',
  'learning', 'gained', 'facilities', 'allows', 'wing', 'existence', 'footballer', 'supporting', 'boy', 'floor', 'missing', 'damage',
  'contact', 'height', 'ordered', 'presence', 'mon', 'defense', 'teaching', 'relations', 'farm', 'tells', 'occurred', 'accused',
  'difference', 'ad', 'sat', 'prison', 'adopted', 'linear', 'exhibition', 'felt', 'passing', 'respectively', 'buried', 'sons',
  'begins', 'iii', 'behavior', 'feet', 'stay', 'representative', 'receive', 'platform', 'boys', 'figures', 'starring', 'lee',
  'wales', 'memorial', 'weak', 'bc', 'showing', 'honor', 'grade', 'affairs', 'democratic', 'captured', 'transport', 'fort',
  'taught', 'declared', 'break', 'choice', 'avenue', 'materials', 'lady', 'scotland', 'documentary', 'morning', 'distribution', 'prevent',
  'unable', 'granted', 'polish', 'weight', 'concerning', 'traffic', 'concert', 'relatively', 'stand', 'letters', 'median', 'proper',
  'opposed', 'asia', 'industrial', 'discussed', 'draw', 'windows', 'empire', 'guide', 'growing', 'attempts', 'theme', 'connected',
  'connection', 'reviewed', 'percent', 'marine', 'positions', 'critics', 'saint', 'promotion', 'ministry', 'formation', 'israel', 'fighting',
  'angeles', 'blood', 'inspired', 'develop', 'sport', 'slightly', 'opera', 'models', 'township', 'refers', 'definition', 'alt',
  'inclusion', 'opposition', 'musician', 'translation', 'households', 'younger', 'portion', 'cars', 'doctor', 'estimated', 'ca', 'sorry',
  'nations', 'resulted', 'contain', 'religion', 'wasn', 'situated', 'spread', 'surrounding', 'origin', 'ideas', 'improved', 'metal',
  'del', 'gas', 'fields', 'frequently', 'bus', 'reduced', 'statistics', 'visit', 'deep', 'painter', 'trust', 'defeat',
  'ball', 'easy', 'explain', 'sides', 'lyrics', 'resulting', 'neutral', 'oldest', 'faculty', 'architecture', 'champions', 'pressure',
  'emperor', 'bbc', 'expansion', 'plants', 'obtained', 'valid', 'scale', 'chosen', 'revert', 'plus', 'wood', 'extensive',
  'chance', 'dates', 'returning', 'murder', 'obvious', 'passes', 'memory', 'machine', 'wed', 'drums', 'save', 'require',
  'jones', 'purposes', 'topics', 'inc', 'exchange', 'rose', 'holds', 'naval', 'fish', 'rationale', 'ranked', 'myself',
  'happy', 'neither', 'ban', 'pop', 'brand', 'guest', 'wouldn', 'seats', 'introduction', 'surname', 'safety', 'stadium',
  'planning', 'beach', 'gun', 'crime', 'kitt', 'facility', 'georgia', 'fa', 'jack', 'ok', 'squadron', 'reserve',
  'risk', 'animals', 'approved', 'fell', 'scottish', 'classes', 'winners', 'thu', 'performances', 'republican', 'showed', 'begin',
  'proposal', 'anyway', 'warning', 'suffered', 'apply', 'arms', 'vice', 'poetry', 'virginia', 'villages', 'agency', 'electric',
  'joint', 'navbox', 'happened', 'literary', 'allowing', 'edward', 'corps', 'logo', 'tue', 'audience', 'ends', 'bronze',
  'mile', 'newly', 'containing', 'application', 'falls', 'medicine', 'florida', 'methods', 'races', 'false', 'properties', 'tools',
  'wars', 'performing', 'du', 'solution', 'succeeded', 'object', 'losing', 'comedy',
  // Domain addition — not part of the generated top-2000 frequency list above.
  // 'resume': named block for this app's highest-frequency false positive — a
  // low-confidence lone "resume" rewrote to the ResumeMatch brand keyterm
  // (JW 0.909). Correct and incorrect single-token rewrites interleave on JW
  // and commonness, so no score threshold separates them; any unlisted
  // inflection or new colliding term defeats this and needs its own entry.
  'resume',
]);
