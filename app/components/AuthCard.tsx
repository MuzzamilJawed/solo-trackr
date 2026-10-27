"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// The backdrop and centred card shared by the password-recovery screens.
// /login keeps its own split layout — it carries the showcase panel, which
// these two short forms don't earn.
export default function AuthCard({
    title,
    subtitle,
    children,
    footer,
}: {
    title: string;
    subtitle: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) {
    return (
        <div className="min-h-screen h-dvh bg-zinc-50 dark:bg-app-dark text-zinc-900 dark:text-white overflow-y-auto">
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 auth-bg-grid" />
                <div className="auth-blob-a absolute top-[-22%] left-[-15%] w-[58%] h-[58%] bg-blue-600/15 blur-[130px] rounded-full" />
                <div className="auth-blob-b absolute bottom-[-22%] right-[-15%] w-[58%] h-[58%] bg-indigo-600/15 blur-[130px] rounded-full" />
                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-zinc-50 dark:from-[#050505] to-transparent" />
            </div>

            <div className="relative z-10 min-h-full flex items-center justify-center px-4 py-6">
                <div className="w-full max-w-[430px]">
                    <div className="flex flex-col items-center mb-7">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/25 mb-4">
                            <span className="text-white font-black text-3xl italic leading-none">S</span>
                        </div>
                        <h1 className="text-2xl font-black tracking-tighter italic uppercase leading-none">
                            Solo<span className="text-blue-500">Trackr</span>
                        </h1>
                    </div>

                    <div className="card backdrop-blur-sm p-6 sm:p-7">
                        <h2 className="text-lg font-black tracking-tighter italic uppercase leading-none">{title}</h2>
                        <p className="text-zinc-500 text-[11px] font-black uppercase tracking-widest mt-2 mb-6 leading-relaxed">
                            {subtitle}
                        </p>
                        {children}
                    </div>

                    <div className="mt-5 flex items-center justify-center">
                        {footer ?? (
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-zinc-500 hover:text-blue-600 transition-colors"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" strokeWidth={3} /> Back to sign in
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
