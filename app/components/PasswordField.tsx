"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// A password input with a show/hide toggle. The caller owns the input's
// classes — pass right padding of `pr-11` so text never runs under the button.
export default function PasswordField({
    value,
    onChange,
    className = "",
    placeholder,
    autoComplete,
    onKeyDown,
    disabled,
    leading,
    ariaLabel,
    id,
}: {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    placeholder?: string;
    autoComplete?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    /** Optional decoration rendered inside the field, on the left. */
    leading?: React.ReactNode;
    /** Accessible name for the input (placeholders alone aren't a label). */
    ariaLabel?: string;
    id?: string;
}) {
    const [shown, setShown] = useState(false);

    return (
        <div className="relative">
            {leading}
            <input
                id={id}
                aria-label={ariaLabel}
                type={shown ? "text" : "password"}
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoComplete={autoComplete}
                disabled={disabled}
                className={className}
            />
            <button
                type="button"
                onClick={() => setShown(s => !s)}
                // Mouse/touch presses keep focus in the input so toggling
                // mid-typing doesn't interrupt; keyboard users can still Tab to it.
                onMouseDown={e => e.preventDefault()}
                aria-pressed={shown}
                aria-label={shown ? "Hide password" : "Show password"}
                title={shown ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/10 transition-all"
            >
                {shown ? <EyeOff className="w-4 h-4" strokeWidth={2.25} /> : <Eye className="w-4 h-4" strokeWidth={2.25} />}
            </button>
        </div>
    );
}
