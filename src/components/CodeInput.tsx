import { useRef, type KeyboardEvent, type ClipboardEvent } from 'react';
import './CodeInput.css';

interface CodeInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
}

export function CodeInput({ length = 6, value, onChange }: CodeInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length);

  function focusInput(index: number) {
    inputs.current[index]?.focus();
  }

  function handleChange(index: number, char: string) {
    if (!/^\d?$/.test(char)) return;
    const next = digits.slice();
    next[index] = char;
    onChange(next.join(''));
    if (char && index < length - 1) {
      focusInput(index + 1);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        handleChange(index, '');
      } else if (index > 0) {
        handleChange(index - 1, '');
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      focusInput(index + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) {
      onChange(pasted.padEnd(length, '').slice(0, length).replace(/ /g, ''));
      const focusIdx = Math.min(pasted.length, length - 1);
      focusInput(focusIdx);
    }
  }

  return (
    <div className="code-input">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          autoFocus={i === 0}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
