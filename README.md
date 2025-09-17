# Wayne County Tax Auction Tracker

A comprehensive web application for tracking and analyzing Wayne County tax auction properties with real-time updates, Zillow integration, and intelligent bid monitoring.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the server
node fast-server.js

# In another terminal, run the update scheduler (for automatic updates)
node update-scheduler.js

# Open in browser
open http://localhost:3001
```

## 📊 Features

### Core Functionality
- **Real-time Property Tracking**: Monitors 2,570+ auction properties
- **Intelligent Update Scheduling**: Automatically increases update frequency as auctions approach closing
- **Zillow Integration**: Fetches property values and details from Zillow
- **Bid Competition Analysis**: Tracks bid changes and identifies hot properties
- **Watchlist**: Save properties of interest with localStorage persistence
- **Advanced Filtering**: Filter by price, location, competition level, and more
- **Analytics Dashboard**: View trends, statistics, and insights

### Update Schedule
The system automatically adjusts update frequency based on auction closing times:
- **< 1 hour to close**: Updates every 1 minute
- **1-3 hours**: Updates every 5 minutes
- **3-6 hours**: Updates every 10 minutes
- **> 6 hours**: Updates every hour

## 🏗️ Architecture

### Backend Components

#### `fast-server.js` (Port 3001)
Main Express server serving the application and API endpoints:
- `/api/properties` - Returns all property data
- `/api/analytics` - Returns analytics and statistics
- `/api/hot-properties` - Returns properties with most bid activity
- Static file serving for the web interface

#### `update-scheduler.js`
Intelligent scheduling system that:
- Runs `parallel-scraper.js` at dynamic intervals
- Updates bid tracking via `bid-tracker.js`
- Refreshes analytics through `analytics-engine.js`
- Maintains data freshness based on auction urgency

#### `parallel-scraper.js`
High-performance scraper using worker processes:
- Scrapes 10 properties concurrently
- Handles 2,570 properties efficiently
- Updates `data/properties.json` with latest auction data

#### `zillow-fetcher.js`
Enriches property data with Zillow information:
- Fetches property values
- Gets property details and images
- Handles rate limiting gracefully
- Updates `data/zillow-data.json`

### Data Management

#### `bid-tracker.js`
Monitors bid activity:
- Records bid snapshots over time
- Identifies hot properties
- Tracks competition levels
- Stores history in `data/bid-snapshots/`

#### `analytics-engine.js`
Processes data for insights:
- Calculates market trends
- Identifies value opportunities
- Generates competition analysis
- Exports to `data/analytics.json`

#### `data-aggregator.js`
Combines multiple data sources:
- Merges auction, Zillow, and analytics data
- Maintains data consistency
- Provides unified API responses

### Frontend

#### Main Interface (`public/index-with-tabs.html`)
Tabbed interface with:
- **Properties Tab**: Browse all properties with filters
- **Analytics Tab**: View trends and statistics
- **Watchlist Tab**: Manage saved properties
- **Zillow Data Tab**: See enriched property information

#### JavaScript Modules
- `public/js/app.js`: Main application logic
- `public/js/analytics.js`: Analytics visualization
- `public/js/watchlist.js`: Watchlist management
- `public/js/zillow-tab.js`: Zillow data display

## 📁 Project Structure

```
/
├── data/                    # Data storage
│   ├── properties.json      # Current auction data
│   ├── zillow-data.json     # Zillow property details
│   ├── analytics.json       # Computed analytics
│   ├── bid-snapshots/       # Historical bid data
│   └── hot-properties.json  # High-activity properties
├── public/                  # Web interface
│   ├── index-with-tabs.html # Main application
│   ├── dashboard.html       # Analytics dashboard
│   └── js/                 # Frontend JavaScript
├── fast-server.js          # Express server
├── update-scheduler.js     # Automatic update system
├── parallel-scraper.js     # Auction data scraper
├── zillow-fetcher.js       # Zillow integration
├── bid-tracker.js          # Bid monitoring
├── analytics-engine.js     # Analytics processing
└── data-aggregator.js      # Data combination
```

## 🔄 Data Flow

1. **Scraping**: `parallel-scraper.js` fetches latest auction data
2. **Enrichment**: `zillow-fetcher.js` adds property values
3. **Tracking**: `bid-tracker.js` monitors changes
4. **Analysis**: `analytics-engine.js` computes insights
5. **Aggregation**: `data-aggregator.js` combines all data
6. **Serving**: `fast-server.js` provides API and web interface
7. **Display**: Frontend renders data with filtering and visualization

## 💡 Usage Tips

### Ensuring Fresh Data

**Simplest Option: Enable Auto-Refresh**
1. Edit `public/js/app.js`
2. Find the `setupAutoRefresh()` function (around line 387)
3. Uncomment lines 391-393
4. Adjust the refresh interval (default is 15 minutes)

```javascript
// Change from:
// setInterval(() => {
//     loadProperties();
// }, autoRefreshMinutes * 60 * 1000);

// To:
setInterval(() => {
    loadProperties();
}, 5 * 60 * 1000); // Refresh every 5 minutes
```

Other options:
- Click the "🔄 Refresh All Data" button manually
- Check "Last Updated" timestamp in the UI
- Monitor console output of `update-scheduler.js` for status

### Performance Optimization
- The server caches aggregated data for fast response
- Parallel scraping uses 10 workers for efficiency
- Frontend uses pagination and lazy loading
- Data updates are incremental where possible

### Monitoring Auctions
1. Add properties to watchlist for easy tracking
2. Use filters to focus on specific criteria
3. Watch competition badges for bid activity (shows bid change count)
4. Check analytics for market trends
5. Review hot properties for high-activity items

## 🛠️ Configuration

### Environment Variables
```bash
# For scraping (in .env file)
AUCTION_USER=your_email@example.com
AUCTION_PASSWORD=your_password

# For running scrapers
WORKERS=10          # Number of parallel scrapers
START_ID=250900000  # First auction ID
END_ID=250902570    # Last auction ID
```

### Adjusting Update Intervals
Edit `update-scheduler.js`:
```javascript
this.intervals = {
    immediate: 1 * 60 * 1000,    // < 1 hour
    urgent: 5 * 60 * 1000,       // 1-3 hours
    regular: 10 * 60 * 1000,     // 3-6 hours
    standard: 60 * 60 * 1000     // > 6 hours
}
```

## 🐛 Troubleshooting

### Data Not Updating
1. Check if `update-scheduler.js` is running
2. Look for errors in console output
3. Verify `data/properties.json` timestamp
4. Ensure network connectivity for scraping

### Missing Zillow Data
- Zillow fetcher respects rate limits
- Some properties may not have Zillow matches
- Check `data/zillow-data.json` for cached data

### High Memory Usage
- Reduce `WORKERS` environment variable
- Clear old bid snapshots: `node bid-tracker.js clean`
- Restart services periodically

## 📈 Analytics Features

- **Competition Score**: 0-100 based on bid frequency
- **Value Opportunities**: Properties below market value
- **Trend Analysis**: Bid patterns over time
- **Hot Properties**: Most active auctions
- **Market Statistics**: Average prices, bid counts, etc.

## 🔒 Data Privacy

- All data is stored locally in the `data/` directory
- No external databases or cloud services used
- Watchlist stored in browser localStorage
- No user tracking or analytics collection

## 📝 Development

### Testing Components
```bash
# Test scraper
node parallel-scraper.js

# Test scheduler once
node update-scheduler.js once

# Test analytics
node analytics-engine.js

# Test bid tracking
node bid-tracker.js
```

## 🚦 Status Indicators

- **🟢 Green**: Fresh data (< 5 minutes old)
- **🟡 Yellow**: Recent data (5-15 minutes old)
- **🔴 Red**: Stale data (> 15 minutes old)
- **⚡ Lightning**: Property updating now
- **🔥 Fire**: Hot property (high activity)
- **Competition Badges**: Show competition level + bid change count

## 📞 Support

For issues or questions about the Wayne County tax auction system, visit:
https://www.waynecounty.com/elected/treasurer/auction.aspx

## License

ISC