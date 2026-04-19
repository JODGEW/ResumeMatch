import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import './ProgressRing.css';

interface Props {
  score: number;
  size?: number;
  label?: string;
}

export function ProgressRing({ score, size = 220, label }: Props) {
  const clampedScore = Math.max(0, Math.min(score, 100));
  const [displayScore, setDisplayScore] = useState(0);
  const arcRef = useRef<SVGCircleElement | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (!arcRef.current) return;
    const arcEl = arcRef.current as SVGCircleElement;

    let frame: number;
    let start = 0;
    const duration = 1800;
    let lastDisplayed = 0;

    arcEl.style.strokeDasharray = `${circumference}`;
    arcEl.style.strokeDashoffset = `${circumference}`;
    setDisplayScore(0);

    function animate(timestamp: number) {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 2);
      const nextValue = clampedScore * eased;
      const nextOffset = circumference - (nextValue / 100) * circumference;
      const nextDisplay = Math.round(nextValue);

      arcEl.style.strokeDashoffset = `${nextOffset}`;
      if (nextDisplay !== lastDisplayed || progress === 1) {
        lastDisplayed = nextDisplay;
        setDisplayScore(nextDisplay);
      }

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        arcEl.style.strokeDashoffset = `${circumference - (clampedScore / 100) * circumference}`;
        setDisplayScore(clampedScore);
      }
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [clampedScore, circumference]);

  const getGradient = () => {
    if (clampedScore >= 86) return { a: 'var(--score-high)', b: 'var(--success)' };
    if (clampedScore >= 76) return { a: 'var(--score-good)', b: 'var(--info)' };
    if (clampedScore >= 61) return { a: 'var(--score-mid)', b: 'var(--warning)' };
    if (clampedScore >= 41) return { a: 'var(--score-low)', b: 'var(--score-low)' };
    return { a: 'var(--score-poor)', b: 'var(--danger)' };
  };

  const getLabel = () => {
    if (clampedScore >= 86) return 'Strong Match';
    if (clampedScore >= 76) return 'Good Match';
    if (clampedScore >= 61) return 'Moderate Match';
    if (clampedScore >= 41) return 'Weak Match';
    return 'Poor Match';
  };

  const getLabelColor = () => {
    if (clampedScore >= 86) return 'var(--score-high)';
    if (clampedScore >= 76) return 'var(--score-good)';
    if (clampedScore >= 61) return 'var(--score-mid)';
    if (clampedScore >= 41) return 'var(--score-low)';
    return 'var(--score-poor)';
  };

  const colors = getGradient();

  return (
    <div
      className="progress-ring"
      style={{ '--progress-ring-size': `${size}px` } as CSSProperties}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="progress-ring__svg">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.a} />
            <stop offset="100%" stopColor={colors.b} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />

        {/* Progress */}
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="progress-ring__arc"
        />
      </svg>

      <div className="progress-ring__center">
        <div className="progress-ring__score-row">
          <span className="progress-ring__value">{displayScore}</span>
          <span className="progress-ring__percent">%</span>
        </div>
        <span className="progress-ring__label" style={{ color: getLabelColor() }}>{label ?? getLabel()}</span>
      </div>
    </div>
  );
}
