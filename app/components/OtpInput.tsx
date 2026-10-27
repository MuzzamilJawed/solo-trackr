"use client";

import { useEffect, useRef } from "react";

// One box per digit. A single text field would be simpler, but people read a
// code off a phone in chunks and want to see it land — and pasting the whole
// code, which every SMS autofill does, has to work in either shape.
export default function OtpInput({
    value,
    onChange,
    length = 6,
    disabled,
    onComplete,
}: {
    value: string;
    onChange: (value: string) => void;
    length?: number;
    disabled?: boolean;
    /** Fired once the last digit lands — lets the form submit itself. */
    onComplete?: (value: string) => void;
}) {
    const refs = useRef<(HTMLInputElement | null)[]>([]);
    const digits = value.padEnd(length, " ").slice(0, length).split("");

    useEffect(() => { refs.current[0]?.focus(); }, []);

    const write = (next: string) => {
        const clean = next.replace(/\D/g, "").slice(0, length);
        onChange(clean);
        if (clean.length === length) onComplete?.(clean);
        return clean;
    };

    const onKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace") {
            e.preventDefault();
            // Backspace on an empty box steps back and clears the one before —
            // otherwise correcting a typo needs two presses per digit.
            const trimmed = value.slice(0, value[index] ? index : Math.max(0, index - 1));
            onChange(trimmed);
            refs.current[Math.max(0, value[index] ? index : index - 1)]?.focus();
            return;
        }
        if (e.key === "ArrowLeft") { e.preventDefault(); refs.current[Math.max(0, index - 1)]?.focus(); }
        if (e.key === "ArrowRight") { e.preventDefault(); refs.current[Math.min(length - 1, index + 1)]?.focus(); }
    };

    const onInput = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const typed = e.target.value.replace(/\D/g, "");
        if (!typed) return;
        const next = write(value.slice(0, index) + typed + value.slice(index + typed.length));
        refs.current[Math.min(length - 1, next.length)]?.focus();
    };

    const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const next = write(e.clipboardData.getData("text"));
        refs.current[Math.min(length - 1, next.length)]?.focus();
    };

    return (
        <div role="group" aria-label="Verification code" className="flex justify-between gap-1.5 sm:gap-2" onPaste={onPaste}>
            {digits.map((digit, i) => (
                <input
                    key={i}
                    ref={el => { refs.current[i] = el; }}
                    value={digit.trim()}
                    onChange={onInput(i)}
                    onKeyDown={onKeyDown(i)}
                    onFocus={e => e.target.select()}
                    disabled={disabled}
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    aria-label={`Digit ${i + 1} of ${length}`}
                    maxLength={1}
                    className="w-full min-w-0 aspect-square max-h-14 text-center rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-lg sm:text-xl font-black font-mono tabular-nums text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 transition-all"
                />
            ))}
        </div>
    );
}
