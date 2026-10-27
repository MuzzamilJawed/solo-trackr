# Quick Start Guide - SoloTrackr Dashboard

## What You've Built 🎯

A complete SoloTrackr dashboard for tracking:
- ✅ Gold & Silver prices
- ✅ PSX stocks 
- ✅ Personal watchlist
- ✅ Customizable settings

## Project Overview 📋

### Main Components:
1. **Sidebar Navigation** - Fixed sidebar with links to all sections
2. **Dashboard Page** - Main page showing overview with key metrics
3. **Prices Page** - Dedicated page for gold and silver prices
4. **Stocks Page** - PSX stock data with filtering by sector
5. **Watchlist Page** - Track your favorite items
6. **Settings Page** - Customize app preferences

### File Structure:
```
app/
├── components/        # Reusable UI components
├── lib/              # API calls and utility functions
├── prices/           # Gold & Silver page
├── stocks/           # PSX stocks page
├── watchlist/        # Watchlist page
├── settings/         # Settings configuration
├── layout.tsx        # Main layout with sidebar
└── page.tsx          # Homepage/dashboard
```

## How to Run 🚀

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Open in Browser
```
http://localhost:3000
```

## Navigation Guide 🧭

- **Dashboard (/)**: Overview of all information
- **Gold & Silver (/prices)**: View precious metals prices
- **PSX Stocks (/stocks)**: Browse stock market data
- **Watchlist (/watchlist)**: Your tracked items
- **Settings (/settings)**: Configure your preferences

## Features Included ⭐

### Dashboard Page
- Quick statistics cards
- Latest gold & silver prices
- Top PSX stocks
- Call-to-action buttons to other pages

### Gold & Silver Prices
- Real-time price display
- Price changes with percentages
- Timeframe selector (1h, 1d, 1w, 1m)
- Market information section
- Support for 24K and 22K gold, silver ounce and kilogram

### PSX Stocks
- Multiple stocks with details
- Sector-based filtering
- Stock price changes
- Open/High/Low/Volume data
- Target prices
- Market summary statistics

### Watchlist
- Add/remove items
- Display both metals and stocks
- Quick removal with X button
- Empty state message
- Watchlist statistics

### Settings
- Currency selection (PKR, USD, EUR)
- Theme options (Light, Dark, Auto)
- Refresh interval settings
- Notification preferences
- Sound alerts toggle
- Price alerts toggle

## API Integration 🔌

Currently using mock data. To add real APIs:

1. Open `app/lib/api.ts`
2. Replace mock data with real API calls:

```typescript
export async function fetchGoldPrice() {
  const response = await fetch('YOUR_API_ENDPOINT');
  return response.json();
}
```

## Styling 🎨

The app uses **Tailwind CSS 4** for styling with:
- Dark mode support
- Responsive design
- Consistent color scheme
- Modern UI components

## Customization Tips 💡

### Change Logo/Title
Edit `app/components/Sidebar.tsx` (line 23-24)

### Add New Pages
1. Create `app/newpage/page.tsx`
2. Add link in `app/components/Sidebar.tsx`

### Modify Mock Data
Update in `app/lib/api.ts`

### Change Colors
Edit Tailwind classes in components

## Build for Production 🏗️

```bash
npm run build
npm start
```

## Troubleshooting 🐛

**Port 3000 already in use?**
```bash
npm run dev -- -p 3001
```

**Styles not loading?**
```bash
npm run build
```

**Clear cache:**
```bash
rm -rf .next
npm run dev
```

## Next Steps 📈

1. ✅ Set up real API endpoints
2. ✅ Add user authentication
3. ✅ Implement database for watchlist
4. ✅ Add price alert notifications
5. ✅ Create charts/graphs
6. ✅ Deploy to Vercel or your hosting

## Support & Documentation 📚

- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org/docs/)

---

Happy tracking! 🚀
