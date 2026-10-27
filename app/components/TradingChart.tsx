"use client";

import { createChart, ColorType, CandlestickSeries, CrosshairMode, HistogramSeries, LineSeries } from 'lightweight-charts';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { Maximize2, Minimize2 } from 'lucide-react';

interface CandleData {
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

interface PriceLine {
    price: number;
    color: string;
    title: string;
}

interface TradingChartProps {
    data: CandleData[];
    title: string;
    onTimeframeChange?: (timeframe: string) => void;
    currentTimeframe?: string;
    currencySymbol?: string;
    seamless?: boolean;
    priceLines?: PriceLine[];
}

export default function TradingChart({
    data,
    title,
    onTimeframeChange,
    currentTimeframe = "1D",
    currencySymbol = "$",
    seamless = false,
    priceLines
}: TradingChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const seriesRef = useRef<any>(null);
    const smaSeriesRef = useRef<any>(null);
    const sma50SeriesRef = useRef<any>(null);
    const sma200SeriesRef = useRef<any>(null);
    const volumeSeriesRef = useRef<any>(null);
    const priceLinesRef = useRef<any[]>([]);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [hoverData, setHoverData] = useState<CandleData | null>(null);
    const { resolvedTheme } = useTheme();

    const colors = useMemo(() => {
        const isDark = resolvedTheme === 'dark';
        return {
            background: isDark ? { top: '#050505', bottom: '#000000' } : { top: '#fafafa', bottom: '#f8fafc' },
            text: isDark ? '#94a3b8' : '#475569',
            grid: isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(148, 163, 184, 0.1)',
            borderColor: isDark ? 'rgba(197, 203, 206, 0.1)' : 'rgba(148, 163, 184, 0.2)',
            crosshair: isDark ? '#3b82f6' : '#2563eb',
            watermark: isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(37, 99, 235, 0.03)'
        };
    }, [resolvedTheme]);

    // Initial Chart Setup
    useEffect(() => {
        if (!chartContainerRef.current || typeof window === 'undefined') return;

        const container = chartContainerRef.current;
        const chart = createChart(container, {
            layout: {
                background: { type: ColorType.VerticalGradient, topColor: colors.background.top, bottomColor: colors.background.bottom },
                textColor: colors.text,
                fontSize: 11,
                fontFamily: 'Inter, sans-serif',
            },
            width: container.clientWidth || 650,
            height: container.clientHeight || 450,
            handleScroll: true,
            handleScale: true,
            grid: {
                vertLines: { color: colors.grid, style: 1 },
                horzLines: { color: colors.grid, style: 1 },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: colors.crosshair,
                    style: 0,
                    labelBackgroundColor: colors.crosshair,
                },
                horzLine: {
                    width: 1,
                    color: colors.crosshair,
                    style: 0,
                    labelBackgroundColor: colors.crosshair,
                },
            },
            rightPriceScale: {
                visible: true,
                borderColor: colors.borderColor,
                autoScale: true,
                alignLabels: true,
                scaleMargins: {
                    top: 0.15,
                    bottom: 0.15,
                },
            },
            timeScale: {
                borderColor: colors.borderColor,
                timeVisible: true,
                secondsVisible: false,
                barSpacing: 10,
                shiftVisibleRangeOnNewBar: true,
                rightOffset: 5,
                tickMarkFormatter: (time: string | number, tickMarkType: number, locale: string) => {
                    const date = typeof time === 'number' ? new Date(time * 1000) : new Date(time);
                    if (isNaN(date.getTime())) return String(time);
                    if (currentTimeframe === '1H') {
                        if (date.getHours() === 0 || tickMarkType < 1) {
                            return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
                        }
                        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
                    }
                    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
                },
            },
            localization: {
                timeFormatter: (time: string | number) => {
                    const date = typeof time === 'number' ? new Date(time * 1000) : new Date(time);
                    if (isNaN(date.getTime())) return String(time);
                    return date.toLocaleString(undefined, { 
                        year: 'numeric', month: 'short', day: 'numeric', 
                        hour: '2-digit', minute: '2-digit' 
                    });
                },
            },
        });

        chart.applyOptions({
            watermark: {
                visible: true,
                fontSize: 48,
                horzAlign: 'center',
                vertAlign: 'center',
                color: colors.watermark,
                text: title.toUpperCase(),
            }
        } as any);

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#10b981', downColor: '#ef4444',
            borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444',
            priceLineVisible: true, priceLineWidth: 1, priceLineColor: '#3b82f6', priceLineStyle: 2,
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => {
                    return currencySymbol + price.toLocaleString(undefined, {
                        minimumFractionDigits: price < 1 ? 4 : 2,
                        maximumFractionDigits: price < 1 ? 6 : 2,
                    });
                },
            },
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: resolvedTheme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
            lastValueVisible: false,
            priceLineVisible: false,
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        // Initialize SMAs
        const smaSeries = chart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        const sma50Series = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        const sma200Series = chart.addSeries(LineSeries, { color: '#ef4444', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

        chart.subscribeCrosshairMove((param) => {
            if (param.time && param.point) {
                const candle = param.seriesData.get(series);
                if (candle) setHoverData(candle as any);
            } else {
                setHoverData(null);
            }
        });

        chartRef.current = chart;
        seriesRef.current = series;
        volumeSeriesRef.current = volumeSeries;
        smaSeriesRef.current = smaSeries;
        sma50SeriesRef.current = sma50Series;
        sma200SeriesRef.current = sma200Series;

        const resizeObserver = new ResizeObserver(entries => {
            if (entries[0] && chartRef.current) {
                const { width, height } = entries[0].contentRect;
                if (width > 0 && height > 0) {
                    chartRef.current.applyOptions({ width, height });
                }
            }
        });

        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
            // Force a resize after a short delay to catch the final layout
            setTimeout(() => {
                if (chartContainerRef.current && chartRef.current) {
                    const { clientWidth, clientHeight } = chartContainerRef.current;
                    chartRef.current.applyOptions({ width: clientWidth, height: clientHeight });
                }
            }, 200);
        }

        return () => {
            resizeObserver.disconnect();
            if (chartRef.current) chartRef.current.remove();
            chartRef.current = null;
            seriesRef.current = null;
            volumeSeriesRef.current = null;
            smaSeriesRef.current = null;
            sma50SeriesRef.current = null;
            sma200SeriesRef.current = null;
        };
    }, [isFullscreen, currencySymbol, title, colors]);

    // Scaling and updates
    useEffect(() => {
        if (chartRef.current && seriesRef.current && data && data.length > 0) {
            try {
                seriesRef.current.setData(data);

                if (volumeSeriesRef.current) {
                    const volumeData = data.map(d => ({
                        time: d.time,
                        value: d.volume || 0,
                        color: d.close >= d.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                    }));
                    volumeSeriesRef.current.setData(volumeData);
                }

                // Calculate SMAs
                if (data.length > 20) {
                    const sma20 = [];
                    const sma50 = [];
                    const sma200 = [];
                    for (let i = 0; i < data.length; i++) {
                        if (i >= 19) {
                            const sum = data.slice(i - 19, i + 1).reduce((a, b) => a + b.close, 0);
                            sma20.push({ time: data[i].time, value: sum / 20 });
                        }
                        if (i >= 49) {
                            const sum = data.slice(i - 49, i + 1).reduce((a, b) => a + b.close, 0);
                            sma50.push({ time: data[i].time, value: sum / 50 });
                        }
                        if (i >= 199) {
                            const sum = data.slice(i - 199, i + 1).reduce((a, b) => a + b.close, 0);
                            sma200.push({ time: data[i].time, value: sum / 200 });
                        }
                    }
                    if (smaSeriesRef.current) smaSeriesRef.current.setData(sma20);
                    if (sma50SeriesRef.current) sma50SeriesRef.current.setData(sma50);
                    if (sma200SeriesRef.current) sma200SeriesRef.current.setData(sma200);
                }

                chartRef.current.timeScale().fitContent();
            } catch (err) {
                console.error("Error updating chart data:", err);
            }
        }
    }, [data, colors, isFullscreen]);

    // Support / resistance (and any other) horizontal price lines
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;
        priceLinesRef.current.forEach(pl => { try { series.removePriceLine(pl); } catch { /* stale */ } });
        priceLinesRef.current = [];
        (priceLines || []).forEach(l => {
            if (!Number.isFinite(l.price)) return;
            try {
                const pl = series.createPriceLine({
                    price: l.price,
                    color: l.color,
                    lineWidth: 1,
                    lineStyle: 2, // dashed
                    axisLabelVisible: true,
                    title: l.title,
                });
                priceLinesRef.current.push(pl);
            } catch { /* series not ready */ }
        });
    }, [priceLines, data, colors, isFullscreen]);

    useEffect(() => {
        document.body.style.overflow = isFullscreen ? 'hidden' : '';
        
        // Trigger resize after state change
        const timer = setTimeout(() => {
            if (chartContainerRef.current && chartRef.current) {
                const { clientWidth, clientHeight } = chartContainerRef.current;
                chartRef.current.applyOptions({ width: clientWidth, height: clientHeight });
            }
        }, 150);

        return () => { 
            document.body.style.overflow = '';
            clearTimeout(timer);
        };
    }, [isFullscreen]);

    const chartContent = (
        <div className={`flex flex-col ${isFullscreen ? '!fixed !top-0 !left-0 !w-screen !h-screen !z-[10000] bg-black p-4' : (seamless ? 'h-full bg-transparent' : 'bg-white dark:bg-app-dark rounded-2xl sm:rounded-[2.5rem] pt-4 px-4 pb-4 sm:pt-8 sm:px-8 sm:pb-6 border border-zinc-200 dark:border-white/5 shadow-2xl h-full')}`}>
            {/* Header Content */}
            <div className={`flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 shrink-0 ${seamless ? 'mb-4' : 'mb-6'}`}>
                <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-[11px] font-black text-blue-600 uppercase tracking-[0.3em] truncate">Price Action</h3>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${currentTimeframe === '1H' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                {currentTimeframe}
                            </span>
                        </div>
                        <h4 className="text-lg sm:text-2xl font-black text-zinc-900 dark:text-white uppercase italic tracking-tighter leading-tight mt-1 truncate">{title}</h4>
                    </div>
                    {hoverData && (
                        <div className="hidden lg:flex items-center gap-6 px-6 py-3 bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl animate-in fade-in slide-in-from-left-4">
                            {[
                                { k: 'O', v: hoverData.open },
                                { k: 'H', v: hoverData.high, c: 'text-green-500' },
                                { k: 'L', v: hoverData.low, c: 'text-red-500' },
                                { k: 'C', v: hoverData.close }
                            ].map(item => (
                                <div key={item.k}>
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{item.k}</p>
                                    <p className={`text-xs font-black font-mono transition-colors ${item.c || 'text-zinc-900 dark:text-white'}`}>
                                        {currencySymbol}{item.v?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap shrink-0">
                    <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-inner">
                        {['1H', '1D', '1W', '1M'].map(tf => (
                            <button
                                key={tf}
                                onClick={() => onTimeframeChange?.(tf)}
                                className={`px-3 sm:px-4 py-2 min-h-[34px] sm:min-h-0 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest ${currentTimeframe === tf ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/40' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="px-3 sm:px-5 py-2 sm:py-2.5 text-[10px] font-black bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all uppercase tracking-widest inline-flex items-center gap-1.5">
                        {isFullscreen ? <><Minimize2 className="w-3 h-3" strokeWidth={2.5} /> Exit</> : <><Maximize2 className="w-3 h-3" strokeWidth={2.5} /> Full</>}
                    </button>
                </div>
            </div>

            {/* Main Chart Container */}
            <div
                ref={chartContainerRef}
                className={`flex-1 relative overflow-hidden transition-all duration-300 min-h-[200px] sm:min-h-[280px] ${isFullscreen ? 'rounded-none border-none min-h-0' : 'h-full border border-zinc-100 dark:border-zinc-800/50 rounded-2xl sm:rounded-[2rem]'}`}
            />

            {/* Footer / Legend */}
            <div className={`flex flex-wrap items-center justify-between gap-2 shrink-0 ${seamless ? 'mt-3' : 'mt-4'}`}>
                <div className="flex items-center gap-2 sm:gap-6 flex-wrap">
                    {data.length > 20 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                            <div className="w-2 h-2 bg-amber-500 rounded-full" />
                            <span className="text-[10px] text-amber-500 font-black tracking-widest uppercase">SMA 20</span>
                        </div>
                    )}
                    {data.length > 50 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            <span className="text-[10px] text-blue-500 font-black tracking-widest uppercase">SMA 50</span>
                        </div>
                    )}
                    {data.length > 200 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/5 border border-red-500/10 rounded-lg">
                            <div className="w-2 h-2 bg-red-500 rounded-full" />
                            <span className="text-[10px] text-red-500 font-black tracking-widest uppercase">SMA 200</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    if (isFullscreen && typeof document !== 'undefined') {
        return createPortal(chartContent, document.body);
    }

    return chartContent;
}
