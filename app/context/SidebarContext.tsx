"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

interface SidebarContextType {
    // Desktop (lg+) collapsed-to-rail state
    collapsed: boolean;
    setCollapsed: (v: boolean) => void;
    toggleCollapsed: () => void;
    // Phone drawer. Lives here so the bottom tab bar's "More" can open it.
    mobileOpen: boolean;
    setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        if (saved === 'true') setCollapsed(true);
        setIsLoaded(true);
    }, []);

    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('sidebar-collapsed', String(collapsed));
        }
    }, [collapsed, isLoaded]);

    const toggleCollapsed = () => setCollapsed(prev => !prev);

    return (
        <SidebarContext.Provider value={{ collapsed, setCollapsed, toggleCollapsed, mobileOpen, setMobileOpen }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (context === undefined) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
}
