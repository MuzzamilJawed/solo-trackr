import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
        return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    }

    try {
        const response = await fetch(`https://dps.psx.com.pk/company/${symbol}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cache-Control': 'no-cache',
            },
            next: { revalidate: 60 } // Cache for 60 seconds
        });

        if (!response.ok) {
            throw new Error(`PSX Detail fetch failed: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const detail: any = {
            symbol: symbol,
            name: $('.company_name').text().trim(),
            sector: $('.company_sector').text().trim(),
            price: ($('.quote__close').first().text() || $('.last').text()).replace(/^Rs\.?\s*/i, '').trim(),
            change: ($('.change__value').first().text() || $('.change').text()).trim(),
            changePercent: ($('.change__percent').first().text() || $('.percentage').text()).replace(/[()\s]/g, ''),
            stats: {}
        };

        // Extract Stats Items (Open, High, Low, Volume, Ratios etc.)
        $('.stats_item').each((_, el) => {
            const label = $(el).find('.stats_label').text().trim().replace('^', '').replace('**', '').trim();
            const value = $(el).find('.stats_value').text().trim();
            if (label) {
                detail.stats[label] = value;
            }
        });

        // Financials (extract multi-year table from #financialTab)
        detail.financialHistory = {
            years: [],
            data: []
        };
        
        // Target the first table inside #financialTab (Annual data)
        const financialTable = $('#financialTab table').first();
        if (financialTable.length > 0) {
            // Extract years from Header
            financialTable.find('thead tr th').each((i, th) => {
                const year = $(th).text().trim();
                if (year && !isNaN(Number(year))) {
                    detail.financialHistory.years.push(year);
                }
            });

            // Extract Rows
            financialTable.find('tbody tr').each((_, tr) => {
                const tds = $(tr).find('td');
                const metric = tds.eq(0).text().trim();
                
                // Only take requested metrics to keep it clean
                const targetMetrics = ['Sales', 'Profit after Taxation', 'EPS', 'Revenue', 'Profit'];
                const isTarget = targetMetrics.some(m => metric.toLowerCase().includes(m.toLowerCase()));
                
                if (isTarget) {
                    const values: string[] = [];
                    tds.each((i, td) => {
                        if (i === 0) return;
                        values.push($(td).text().trim());
                    });
                    detail.financialHistory.data.push({ metric, values });
                }
            });
        }

        // Equity Profile
        detail.profile = {
            registration: $('.registration_number').text().trim() || 'N/A',
            incorporation: $('.incorporation_date').text().trim() || 'N/A',
            address: $('.company_address').text().trim() || 'N/A',
            registrar: $('.registrar').text().trim() || 'N/A',
            marketCapDetailed: getStat(['Market Cap (000\'s)']),
            shares: getStat(['Shares']),
            freeFloat: getStat(['Free Float']),
            freeFloatPercentage: getStat(['Free Float %', 'Free Float (Percent)'])
        };

        // If Free Float mapping failed above, try to find the percentage one separately
        if (detail.profile.freeFloatPercentage === 'N/A') {
             const ffKey = Object.keys(detail.stats).find(sk => sk.includes('Free Float') && sk.includes('%'));
             if (ffKey) detail.profile.freeFloatPercentage = detail.stats[ffKey];
        }

        // Robust mapping helper
        function getStat(keys: string[]) {
            for (const k of keys) {
                const foundKey = Object.keys(detail.stats).find(sk => 
                    sk.toLowerCase().includes(k.toLowerCase().trim())
                );
                if (foundKey) return detail.stats[foundKey];
            }
            return 'N/A';
        }

        // Ratios & Performance Mapping
        detail.ratios = {
            pe: getStat(['P/E Ratio', 'PE Ratio', 'P/E']),
            eps: getStat(['EPS']),
            marketCap: getStat(['Market Cap']),
            divYield: getStat(['Div. Yield', 'Dividend Yield']),
            beta: getStat(['BETA']),
        };

        detail.performance = {
            ytd: getStat(['YTD Change']),
            oneYear: getStat(['1-YEAR CHANGE', '1 Year Change']),
            dayRange: getStat(['DAY RANGE']),
            yearRange: getStat(['52-WEEK RANGE', '52-WK RANGE', '52 Week'])
        };

        detail.limits = {
            circuitBreaker: getStat(['CIRCUIT BREAKER']),
            ldcp: getStat(['LDCP']) === 'N/A' ? '0.00' : getStat(['LDCP']),
            haircut: getStat(['HAIRCUT']) === 'N/A' ? '0.00' : getStat(['HAIRCUT']),
            var: getStat(['VAR']) === 'N/A' ? '0.00' : getStat(['VAR'])
        };

        detail.orderBook = {
            bid: getStat(['BID PRICE']) === 'N/A' ? '0.00' : getStat(['BID PRICE']),
            ask: getStat(['ASK PRICE']) === 'N/A' ? '0.00' : getStat(['ASK PRICE']),
            bidVol: getStat(['BID VOLUME']) === 'N/A' ? '0' : getStat(['BID VOLUME']),
            askVol: getStat(['ASK VOLUME']) === 'N/A' ? '0' : getStat(['ASK VOLUME'])
        };

        return NextResponse.json({ success: true, data: detail });
    } catch (error: any) {
        console.error('PSX Detail scraping error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
