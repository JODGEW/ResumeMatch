import './Mascot.css';

export type MascotState = 'idle' | 'analyzing' | 'success' | 'error' | 'timeout';

type Point = readonly [x: number, y: number, rotationDeg: number];

type Pose = {
  body: string;
  eyes: string;
  gaze?: string;
  browRAnim?: string;
  armL: string;
  handL: Point;
  armLAnim: string;
  armR: string;
  handR: Point;
  armRAnim: string;
  /** Right arm renders in front of the face instead of behind the body. */
  front?: boolean;
  browL: string;
  browR: string;
  mouth: string;
  eye?: readonly [rx: number, ry: number];
  hl?: readonly [dx: number, dy: number];
  arcL?: string;
  arcR?: string;
  scan?: boolean;
  sparkles?: boolean;
  drop?: boolean;
  clock?: boolean;
};

// Geometry, keyframe names, durations and easings are the final values from the
// Claude Design handoff (design_handoff_resumematch_mascot/Mascot.dc.html).
// Redraw nothing here; change the design file first.
const STATES: Record<MascotState, Pose> = {
  idle: {
    body: 'mm-bob 3.6s ease-in-out infinite',
    eyes: 'mm-blink 4.4s ease-in-out infinite',
    armL: 'M42 132 C32 146 26 160 24 172', handL: [22, 180, 200], armLAnim: 'none',
    armR: 'M160 120 C172 112 180 98 184 82', handR: [186, 74, 8], armRAnim: 'mm-wave 6.4s ease-in-out infinite',
    browL: 'M72 72 Q79 67 86 70', browR: 'M110 66 Q117 62 124 66',
    mouth: 'M95 107 Q100 112 105 107', eye: [7.5, 10.5], hl: [-2.5, -4.5],
  },
  analyzing: {
    body: 'mm-think 3s ease-in-out infinite',
    eyes: 'mm-scan 1.8s ease-in-out infinite',
    armL: 'M42 132 C32 146 26 160 24 172', handL: [22, 180, 200], armLAnim: 'none',
    armR: 'M160 128 C170 122 166 110 150 108', handR: [138, 108, 84], armRAnim: 'mm-tap 1.5s ease-in-out infinite', front: true,
    browL: 'M72 74 Q79 70 86 73', browR: 'M110 64 Q117 58 124 62',
    mouth: 'M96 108 H104', eye: [7, 10], hl: [-2.5, -4.5], scan: true,
  },
  success: {
    body: 'mm-celebrate 2.6s cubic-bezier(.3,.6,.3,1) infinite',
    eyes: 'none',
    armL: 'M42 126 C30 110 24 92 22 74', handL: [20, 64, -34], armLAnim: 'mm-cheerL 2.6s ease-in-out infinite',
    armR: 'M160 118 C174 104 180 86 182 70', handR: [184, 60, 26], armRAnim: 'mm-cheerR 2.6s ease-in-out infinite',
    browL: 'M72 70 Q79 64 86 67', browR: 'M110 64 Q117 59 124 63',
    mouth: 'M92 104 Q100 114 108 104', sparkles: true,
    arcL: 'M74 92 Q82 80 90 92', arcR: 'M110 89 Q118 77 126 89',
  },
  error: {
    body: 'mm-shake .5s ease-in-out, mm-sag 3.2s ease-in-out .5s infinite',
    eyes: 'mm-blink 3.2s ease-in-out infinite',
    armL: 'M42 130 C28 128 16 132 8 140', handL: [2, 146, -118], armLAnim: 'mm-shrug 3.2s ease-in-out .5s infinite',
    armR: 'M160 124 C174 122 186 126 194 134', handR: [200, 140, 118], armRAnim: 'mm-shrugR 3.2s ease-in-out .5s infinite',
    browL: 'M72 75 Q79 70 86 68', browR: 'M110 66 Q117 68 124 73',
    mouth: 'M96 109 Q98 106 100 109 Q102 112 104 109', eye: [7, 10], hl: [-2, -2], drop: true,
  },
  // Front-end wait timed out, outcome unknown: glance at the clock, then look
  // back up at the user with one brow raised. One 2s beat, then rest — only the
  // blink loops. Replays on re-entry because the SVG is keyed by state.
  timeout: {
    body: 'mm-peek 2s ease-in-out both',
    eyes: 'mm-blink 5.2s ease-in-out infinite',
    gaze: 'mm-gaze 2s ease-in-out both',
    browRAnim: 'mm-brow 2s ease-in-out both',
    armL: 'M42 132 C32 146 26 160 24 172', handL: [22, 180, 200], armLAnim: 'none',
    armR: 'M158 140 C168 148 176 148 180 144', handR: [184, 140, 24], armRAnim: 'none', front: true,
    browL: 'M72 73 Q79 69 86 71', browR: 'M110 67 Q117 63 124 68',
    mouth: 'M95 109 H105', eye: [7.5, 10.5], hl: [-2.5, -4.5], clock: true,
  },
};

const HAND_PATH =
  'M-10 4 C-12 -4 -6 -11 2 -11 C6 -11 8 -9 9 -6 C12 -10 16 -8 14 -3 C12 1 10 2 9 3 C8 9 0 12 -6 9 C-9 8 -11 6 -10 4 Z';

type MascotProps = {
  state?: MascotState;
  /** Square, in px. */
  size?: number;
  /** false → every animation off, final static pose. */
  motion?: boolean;
  /**
   * Swaps the tinted fills and ground shadow for a dark surface. Omit to follow
   * the app theme; pass a boolean to force one look regardless of theme.
   */
  onDark?: boolean;
  ink?: string;
  paper?: string;
  accent?: string;
  className?: string;
};

export function Mascot({
  state = 'idle',
  size = 160,
  motion = true,
  onDark,
  ink = '#2e3354',
  paper = '#fdfbf5',
  accent = 'var(--accent)',
  className,
}: MascotProps) {
  const pose = STATES[state];
  const small = size < 48;
  const tiny = size < 32;
  const sw = small ? 7.5 : 5.5;
  const browW = small ? 5 : 3.5;
  const hl = pose.hl ?? [-2.5, -4.5];
  const [eyeRx, eyeRy] = pose.eye ?? [7.5, 10.5];
  const anim = (value: string | undefined) => ({ animation: motion && value ? value : 'none' });
  const lineAnim = (delay: number) =>
    anim(pose.scan ? `mm-linepulse 1.8s ease-in-out ${delay}s infinite` : undefined);

  const classes = ['mascot'];
  if (onDark !== undefined) classes.push(onDark ? 'mascot--on-dark' : 'mascot--on-light');
  if (className) classes.push(className);

  const rightArm = (
    <g style={{ transformOrigin: '158px 120px', ...anim(pose.armRAnim) }}>
      <path d={pose.armR} stroke={ink} strokeWidth={sw} strokeLinecap="round" />
      <path
        d={HAND_PATH}
        transform={`translate(${pose.handR[0]} ${pose.handR[1]}) rotate(${pose.handR[2]})`}
        fill={paper}
        stroke={ink}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </g>
  );

  return (
    <svg
      // Remount on state change so one-shot animations (the timeout beat, the
      // error shake) replay on re-entry; re-applying the same animation-name to
      // a kept DOM node does not restart it.
      key={state}
      className={classes.join(' ')}
      width={size}
      height={size}
      viewBox="0 0 200 220"
      fill="none"
      role="img"
      aria-label="ResumeMatch mascot"
    >
      {!small && (
        <>
          <ellipse className="mascot__shadow" cx="100" cy="206" rx="62" ry="7" />
          <ellipse className="mascot__shadow" cx="100" cy="206" rx="46" ry="5" />
        </>
      )}
      <g style={{ transformOrigin: '100px 190px', ...anim(pose.body) }}>
        <g style={{ transformOrigin: '100px 110px', transform: 'rotate(-6deg)' }}>
          {!tiny && (
            <>
              <g style={{ transformOrigin: '44px 130px', ...anim(pose.armLAnim) }}>
                <path d={pose.armL} stroke={ink} strokeWidth={sw} strokeLinecap="round" />
                <path
                  d={HAND_PATH}
                  transform={`translate(${pose.handL[0]} ${pose.handL[1]}) rotate(${pose.handL[2]})`}
                  fill={paper}
                  stroke={ink}
                  strokeWidth={sw}
                  strokeLinejoin="round"
                />
              </g>
              {!pose.front && rightArm}
            </>
          )}
          <path
            d="M78 26 C98 23 116 22 128 26 L158 56 C160 92 161 132 158 168 C157 186 146 195 128 195 C102 197 74 197 60 193 C47 189 41 179 41 164 C39 130 39 92 43 62 C45 45 57 29 78 26 Z"
            fill={paper}
            stroke={ink}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          <path
            className="mascot__tint"
            d="M128 26 C127 36 127 44 129 50 C133 56 142 56 158 56 Z"
            stroke={ink}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          {/* Long / short / medium — the same rhythm as LogoMark's h12 / h8 / h10,
              scaled up. Change both together. */}
          <g>
            <rect className="mascot__tint" x="64" y="132" width="72" height="9" rx="4.5" style={lineAnim(0)} />
            <rect className="mascot__tint" x="64" y="149" width="48" height="9" rx="4.5" style={lineAnim(0.3)} />
            <rect className="mascot__tint" x="64" y="166" width="60" height="9" rx="4.5" style={lineAnim(0.6)} />
            {motion && pose.scan && !small && (
              <rect
                x="58"
                y="128"
                width="84"
                height="3"
                rx="1.5"
                fill={accent}
                style={{ animation: 'mm-scanbar 1.8s linear infinite' }}
              />
            )}
          </g>
          <path d={pose.browL} stroke={ink} strokeWidth={browW} strokeLinecap="round" />
          <g style={{ transformOrigin: '117px 66px', ...anim(pose.browRAnim) }}>
            <path d={pose.browR} stroke={ink} strokeWidth={browW} strokeLinecap="round" />
          </g>
          {/* Blink (outer) and gaze (inner) must stay on separate groups: a CSS
              animation overrides the transform of the element it runs on. */}
          <g style={{ transformOrigin: '100px 88px', ...anim(pose.eyes) }}>
            <g style={anim(pose.gaze)}>
              {pose.arcL && pose.arcR ? (
                <>
                  <path d={pose.arcL} stroke={ink} strokeWidth={browW} strokeLinecap="round" fill="none" />
                  <path d={pose.arcR} stroke={ink} strokeWidth={browW} strokeLinecap="round" fill="none" />
                </>
              ) : (
                <>
                  <ellipse cx="82" cy="90" rx={eyeRx} ry={eyeRy} fill={ink} />
                  <ellipse cx="118" cy="86" rx={eyeRx} ry={eyeRy} fill={ink} />
                  <circle cx={82 + hl[0]} cy={90 + hl[1]} r="2.6" fill="#ffffff" />
                  <circle cx={118 + hl[0]} cy={86 + hl[1]} r="2.6" fill="#ffffff" />
                </>
              )}
            </g>
          </g>
          {!tiny && (
            <path d={pose.mouth} stroke={ink} strokeWidth={browW} strokeLinecap="round" fill="none" />
          )}
          {pose.clock && !small && (
            <g>
              <circle className="mascot__clock" cx="170" cy="122" r="19" fill={paper} strokeWidth={sw} />
              <path
                d="M170 111 V122 H178"
                stroke={ink}
                strokeWidth={browW}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </g>
          )}
          {!tiny && pose.front && rightArm}
          {pose.drop && !small && (
            <path
              d="M30 60 Q21 74 30 80 Q39 74 30 60 Z"
              fill="#9fb8e8"
              style={anim('mm-drop 2.2s ease-in .4s infinite')}
            />
          )}
        </g>
      </g>
      {pose.sparkles && !small && (
        <>
          <g style={{ transformOrigin: '30px 44px', ...anim('mm-sparkle 2.6s ease-out infinite') }}>
            <path d="M30 32 L33 41 L42 44 L33 47 L30 56 L27 47 L18 44 L27 41 Z" fill={accent} />
          </g>
          <g style={{ transformOrigin: '174px 26px', ...anim('mm-sparkle 2.6s ease-out .18s infinite') }}>
            <path
              d="M174 16 L176.5 23.5 L184 26 L176.5 28.5 L174 36 L171.5 28.5 L164 26 L171.5 23.5 Z"
              fill={accent}
            />
          </g>
          <g style={{ transformOrigin: '184px 120px', ...anim('mm-sparkle 2.6s ease-out .34s infinite') }}>
            <path
              d="M184 113 L185.8 118.2 L191 120 L185.8 121.8 L184 127 L182.2 121.8 L177 120 L182.2 118.2 Z"
              fill={accent}
            />
          </g>
        </>
      )}
    </svg>
  );
}
