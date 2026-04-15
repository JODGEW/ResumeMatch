import { useEffect, useState } from 'react';
import './ProgressRing.css';

interface Props {
  score: number;
  size?: number;
  label?: string;
}

export function ProgressRing({ score, size = 220, label }: Props) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    let frame: number;
    let start = 0;
    const duration = 1400;

    function animate(timestamp: number) {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(score * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const getGradient = () => {
    if (score >= 86) return { a: 'var(--score-high)', b: 'var(--success)' };
    if (score >= 76) return { a: 'var(--score-good)', b: 'var(--info)' };
    if (score >= 61) return { a: 'var(--score-mid)', b: 'var(--warning)' };
    if (score >= 41) return { a: 'var(--score-low)', b: 'var(--score-low)' };
    return { a: 'var(--score-poor)', b: 'var(--danger)' };
  };

  const getLabel = () => {
    if (score >= 86) return 'Strong Match';
    if (score >= 76) return 'Good Match';
    if (score >= 61) return 'Moderate Match';
    if (score >= 41) return 'Weak Match';
    return 'Poor Match';
  };

  const getLabelColor = () => {
    if (score >= 86) return 'var(--score-high)';
    if (score >= 76) return 'var(--score-good)';
    if (score >= 61) return 'var(--score-mid)';
    if (score >= 41) return 'var(--score-low)';
    return 'var(--score-poor)';
  };

  const colors = getGradient();

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="progress-ring__svg">
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.a} />
            <stop offset="100%" stopColor={colors.b} />
          </linearGradient>
          <filter id="ring-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComponentTransfer in="blur" result="dimBlur">
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="dimBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
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
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter="url(#ring-glow)"
          className="progress-ring__arc"
        />
      </svg>

      <div className="progress-ring__center">
        <div className="progress-ring__score-row">
          <span className="progress-ring__value">{animatedScore}</span>
          <span className="progress-ring__percent">%</span>
        </div>
        <span className="progress-ring__label" style={{ color: getLabelColor() }}>{label ?? getLabel()}</span>
      </div>
    </div>
  );
}
