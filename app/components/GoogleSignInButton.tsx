"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

// Renders Google Identity Services' official button. The `credential` it hands
// back is a signed ID token — the server verifies it before trusting anything
// in it (see lib/google.ts).

const GSI_SRC = "https://accounts.google.com/gsi/client";

declare global {
    interface Window {
        google?: any;
    }
}

const loadGsi = (() => {
    let promise: Promise<void> | null = null;
    return () => {
        if (promise) return promise;
        promise = new Promise<void>((resolve, reject) => {
            if (typeof document === "undefined") return reject(new Error("no document"));
            if (window.google?.accounts?.id) return resolve();
            const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
            const script = existing ?? document.createElement("script");
            script.src = GSI_SRC;
            script.async = true;
            script.defer = true;
            script.addEventListener("load", () => resolve());
            script.addEventListener("error", () => { promise = null; reject(new Error("Google script blocked")); });
            if (!existing) document.head.appendChild(script);
        });
        return promise;
    };
})();

export default function GoogleSignInButton({
    clientId,
    onCredential,
    disabled,
}: {
    clientId: string;
    onCredential: (credential: string) => void;
    disabled?: boolean;
}) {
    const holder = useRef<HTMLDivElement>(null);
    const callback = useRef(onCredential);
    const { resolvedTheme } = useTheme();
    const [failed, setFailed] = useState(false);

    // Keep the latest handler without re-rendering Google's button.
    useEffect(() => { callback.current = onCredential; }, [onCredential]);

    useEffect(() => {
        let cancelled = false;
        loadGsi()
            .then(() => {
                if (cancelled || !holder.current || !window.google?.accounts?.id) return;
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: (res: { credential?: string }) => {
                        if (res?.credential) callback.current(res.credential);
                    },
                });
                holder.current.innerHTML = "";
                window.google.accounts.id.renderButton(holder.current, {
                    type: "standard",
                    theme: resolvedTheme === "light" ? "outline" : "filled_black",
                    size: "large",
                    text: "continue_with",
                    shape: "pill",
                    logo_alignment: "center",
                    width: 320,
                });
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [clientId, resolvedTheme]);

    if (failed) {
        return (
            <p className="text-center text-[11px] font-black text-zinc-400 uppercase tracking-widest">
                Google sign-in couldn&apos;t load — use your email and password
            </p>
        );
    }

    return (
        <div className={`flex justify-center ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
            <div ref={holder} />
        </div>
    );
}
