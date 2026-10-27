# SoloTrackr Dashboard 📊

A centralized dashboard application to manage and monitor all your daily information in one place - including gold & silver prices, PSX stocks, and a personal watchlist.

## Features ✨

- **📊 Dashboard**: Quick overview of all your data with key metrics
- **💎 Gold & Silver Prices**: Real-time precious metals market data with price trends
- **📈 PSX Stocks**: Pakistan Stock Exchange market data with sector filtering
- **⭐ Watchlist**: Track your favorite metals and stocks in one place
- **⚙️ Settings**: Customizable preferences (currency, theme, notifications)
- **🎨 Dark Mode**: Full dark mode support for comfortable viewing
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices

## Tech Stack 🛠️

- **Framework**: Next.js 16.1.6 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **React**: 19.2.3

## Project Structure 📁

```
app/
├── components/          # Reusable components
│   ├── PriceCard.tsx   # Gold/Silver price display
│   ├── StockCard.tsx   # Individual stock card
│   ├── StatCard.tsx    # Statistics display
│   └── Sidebar.tsx     # Navigation sidebar
├── lib/                # Utility functions
│   ├── api.ts         # API calls and mock data
│   └── utils.ts       # Helper functions
├── prices/            # Gold & Silver page
├── stocks/            # PSX stocks page
├── watchlist/         # Watchlist page
├── settings/          # Settings page
├── layout.tsx         # Root layout with sidebar
├── page.tsx           # Main dashboard page
└── globals.css        # Global styles
```

## Getting Started 🚀

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```

3. **Open Browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Pages 📄

- **Dashboard** (`/`): Overview with quick stats and key information
- **Gold & Silver** (`/prices`): Detailed precious metals pricing
- **PSX Stocks** (`/stocks`): Stock market data with sector filtering
- **Watchlist** (`/watchlist`): Your tracked items with quick actions
- **Settings** (`/settings`): App configuration and preferences

## Features in Development 🔄

- [ ] Real API integration for live prices
- [ ] Price alert notifications
- [ ] Historical price charts
- [ ] Export watchlist to CSV
- [ ] User authentication
- [ ] Cloud backup of watchlist
- [ ] Mobile app version

## API Integration 🔌

Currently using mock data. To integrate real APIs:

1. Update the API functions in `app/lib/api.ts`
2. Replace mock endpoints with real API URLs:
   - Gold/Silver prices: [Your preferred API]
   - PSX stocks: [PSX official API or third-party]

## Customization 🎨

### Change Colors
Edit Tailwind classes in components or modify `tailwind.config.ts`

### Add More Data
Update mock data in `app/lib/api.ts` or connect to real APIs

### Add New Pages
Create new folders in `app/` and add a `page.tsx` file

## Scripts 📝

```bash
npm run dev    # Start development server
npm run build  # Build for production
npm start      # Start production server
npm run lint   # Run ESLint
```

## Browser Support 🌐

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Future Enhancements 💡

- Price comparison tools
- Portfolio analysis
- Advanced charting
- Email notifications
- Multi-currency support
- Export to Excel
- API rate limiting

## License 📄

This project is open source and available under the MIT License.

## Support 🤝

For questions or issues, please create an issue in the repository.

---

**Made with ❤️ for better financial tracking**
