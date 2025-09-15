# Wayne County Auction Property Analysis Tool
## Complete Implementation Documentation

### Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [API Integrations](#api-integrations)
4. [Database Setup](#database-setup)
5. [Deployment Instructions](#deployment-instructions)
6. [Manual Setup Steps](#manual-setup-steps)
7. [Usage Guide](#usage-guide)

---

## Project Overview

This tool automates the analysis of Wayne County tax auction properties by:
- Scraping auction data from the Wayne County Treasurer website
- Enriching properties with Zillow data and Google Maps imagery
- Ranking properties using a dual-heap algorithm based on profit potential
- Displaying results organized by closing time with bid status

### Key Features
- **Automated Scraping**: Iterates through auction IDs (250900000 - 250902570)
- **Data Enrichment**: Pulls Zillow estimates, photos, and comparable sales
- **Smart Ranking**: Uses max-heap for minimum bids, min-heap for profit potential
- **Real-time Updates**: Tracks bidding status and closing time changes
- **Budget Filtering**: Filters properties by maximum bid amount

---

## Architecture

### Technology Stack
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js with Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL)
- **APIs**: Zillow (via RapidAPI), Google Maps
- **Scraping**: Playwright
- **Hosting**: Vercel

### Project Structure
```
Framework Realestate Solutions/
├── api/
│   └── auction/
│       ├── scrape.js         # Scraping endpoint
│       ├── properties.js     # Get enriched properties
│       ├── analyze.js        # Analysis endpoint
│       └── track.js          # Property tracking
├── js/
│   ├── auction-scraper.js    # Playwright scraper
│   ├── auction-enrichment.js # Data enrichment
│   └── auction-analyzer.js   # Ranking algorithm
├── auction-dashboard.html    # Main interface
├── css/
│   └── auction-dashboard.css # Dashboard styles
└── database/
    └── auction-schema.sql     # Database migrations
```

---

## API Integrations

### 1. Zillow API (Existing Integration)
The project already uses Zillow API through RapidAPI. The auction tool leverages this existing setup:

```javascript
// Uses existing property-api.js
const API_CONFIG = {
    baseUrl: '/api',
    endpoints: {
        search: '/properties/search',
        property: '/properties',
        radius: '/properties/radius'
    }
};
```

**Required Environment Variables:**
```
ZILLOW_API_KEY=your_rapidapi_key_here
```

### 2. Google Maps Integration
For property images and street view:

```javascript
// Google Street View API
const getStreetViewImage = (address) => {
    const baseUrl = 'https://maps.googleapis.com/maps/api/streetview';
    const params = {
        size: '640x480',
        location: encodeURIComponent(address),
        key: process.env.GOOGLE_MAPS_API_KEY
    };
    return `${baseUrl}?${new URLSearchParams(params)}`;
};

// Google Static Maps API
const getMapImage = (address) => {
    const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
    const params = {
        size: '640x480',
        zoom: '15',
        center: encodeURIComponent(address),
        markers: `color:red|${encodeURIComponent(address)}`,
        key: process.env.GOOGLE_MAPS_API_KEY
    };
    return `${baseUrl}?${new URLSearchParams(params)}`;
};
```

**Required Environment Variables:**
```
GOOGLE_MAPS_API_KEY=your_google_maps_key_here
```

### 3. Wayne County Auction Site
No API available - requires web scraping:

```javascript
// Playwright configuration for scraping
const scraperConfig = {
    baseUrl: 'https://www.waynecountytreasurermi.com',
    endpoints: {
        propertyDetails: '/AuctionPropertyDetails.aspx?AI_ID=',
        login: '/login.aspx'
    },
    selectors: {
        parcelId: '#ContentPlaceHolder1_lblPIN',
        address: '#ContentPlaceHolder1_lblAddress',
        city: '#ContentPlaceHolder1_lblCity',
        currentBid: '#ContentPlaceHolder1_lblCurrent_Bid',
        minBid: '#ContentPlaceHolder1_lblMinBid',
        closingTime: '#ContentPlaceHolder1_lblAuctionCloses',
        status: '#ContentPlaceHolder1_lblStatus'
    }
};
```

---

## Database Setup

### Supabase Configuration

1. **Create Supabase Project**
   - Go to https://supabase.com
   - Create new project
   - Note the URL and keys

2. **Database Schema**

```sql
-- Auction properties table
CREATE TABLE auction_properties (
    id SERIAL PRIMARY KEY,
    auction_id VARCHAR(20) UNIQUE NOT NULL,
    parcel_id VARCHAR(50),
    address VARCHAR(255),
    city VARCHAR(100),
    zip_code VARCHAR(10),
    current_bid DECIMAL(12, 2),
    minimum_bid DECIMAL(12, 2),
    sev_value DECIMAL(12, 2),
    closing_time TIMESTAMP,
    status VARCHAR(50),
    has_bids BOOLEAN DEFAULT false,
    batch_number INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enrichment data table
CREATE TABLE property_enrichment (
    id SERIAL PRIMARY KEY,
    auction_property_id INTEGER REFERENCES auction_properties(id),
    zillow_zpid VARCHAR(50),
    zillow_estimate DECIMAL(12, 2),
    rent_estimate DECIMAL(12, 2),
    bedrooms INTEGER,
    bathrooms DECIMAL(3, 1),
    square_feet INTEGER,
    year_built INTEGER,
    property_type VARCHAR(50),
    zillow_image_url TEXT,
    street_view_url TEXT,
    map_image_url TEXT,
    comparable_sales JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Analysis results table
CREATE TABLE auction_analysis (
    id SERIAL PRIMARY KEY,
    auction_property_id INTEGER REFERENCES auction_properties(id),
    profit_potential DECIMAL(12, 2),
    roi_percentage DECIMAL(5, 2),
    rehab_estimate DECIMAL(12, 2),
    rank_score DECIMAL(10, 2),
    recommendation VARCHAR(50),
    analysis_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Bid tracking table
CREATE TABLE bid_tracking (
    id SERIAL PRIMARY KEY,
    auction_property_id INTEGER REFERENCES auction_properties(id),
    bid_amount DECIMAL(12, 2),
    bid_time TIMESTAMP,
    bid_count INTEGER,
    is_winning BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_auction_id ON auction_properties(auction_id);
CREATE INDEX idx_closing_time ON auction_properties(closing_time);
CREATE INDEX idx_has_bids ON auction_properties(has_bids);
CREATE INDEX idx_profit_potential ON auction_analysis(profit_potential DESC);
```

3. **Environment Variables**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```

---

## Deployment Instructions

### Vercel Deployment

1. **Update vercel.json**
```json
{
  "version": 2,
  "buildCommand": "",
  "outputDirectory": ".",
  "functions": {
    "api/**/*.js": {
      "maxDuration": 30
    },
    "api/auction/scrape.js": {
      "maxDuration": 60
    }
  },
  "crons": [
    {
      "path": "/api/auction/scrape",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

2. **Add Environment Variables in Vercel**
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Add all required keys:
     - `ZILLOW_API_KEY`
     - `GOOGLE_MAPS_API_KEY`
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_KEY`
     - `AUCTION_USER` (optional, for authenticated scraping)
     - `AUCTION_PASSWORD` (optional)

3. **Deploy Command**
```bash
vercel --prod
```

---

## Manual Setup Steps

### 1. Initial Setup

```bash
# Clone or navigate to project
cd "Framework Realestate Solutions"

# Install dependencies
npm install playwright @supabase/supabase-js

# Install Playwright browsers
npx playwright install chromium
```

### 2. Configure Scraper Authentication (Optional)

If the auction site requires login:

```javascript
// In auction-scraper.js
async function authenticateScraper(page) {
    await page.goto('https://www.waynecountytreasurermi.com/login.aspx');
    await page.fill('#txtUserName', process.env.AUCTION_USER);
    await page.fill('#txtPassword', process.env.AUCTION_PASSWORD);
    await page.click('#btnLogin');
    await page.waitForNavigation();
}
```

### 3. Test Scraper Locally

```bash
# Create test script
node -e "
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto('https://www.waynecountytreasurermi.com/AuctionPropertyDetails.aspx?AI_ID=250902200');
    const parcel = await page.textContent('#ContentPlaceHolder1_lblPIN');
    console.log('Parcel ID:', parcel);
    await browser.close();
})();
"
```

### 4. Initialize Database

```bash
# Run migrations through Supabase dashboard or CLI
npx supabase db push
```

---

## Usage Guide

### Running the Scraper

#### Manual Trigger
```bash
# One-time scrape
curl -X POST https://your-domain.vercel.app/api/auction/scrape \
  -H "Content-Type: application/json" \
  -d '{"startId": 250900000, "endId": 250900100}'
```

#### Scheduled Scraping
The scraper runs automatically every 15 minutes via Vercel Cron.

### Viewing the Dashboard

1. **Access Dashboard**
   ```
   https://your-domain.vercel.app/auction-dashboard.html
   ```

2. **Filter Options**
   - Maximum bid amount
   - Closing time window
   - Property type
   - Bid status (unbid properties)

3. **Understanding Rankings**

   **Profit Potential Score** = (Zillow Estimate - Total Investment) / Total Investment × 100
   
   Where Total Investment = Current/Min Bid + Estimated Rehab

   **Ranking Categories:**
   - 🟢 **High Priority**: ROI > 30%, closing soon, no bids
   - 🟡 **Medium Priority**: ROI 15-30%, moderate competition
   - 🔴 **Low Priority**: ROI < 15% or high competition

### API Endpoints

#### Get All Properties
```javascript
fetch('/api/auction/properties')
  .then(res => res.json())
  .then(data => console.log(data));
```

#### Get Analysis
```javascript
fetch('/api/auction/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    maxBid: 75000,
    closingWindow: 48 // hours
  })
})
  .then(res => res.json())
  .then(data => console.log(data.recommendations));
```

#### Track Specific Property
```javascript
fetch('/api/auction/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    auctionId: '250902200',
    notify: true
  })
})
  .then(res => res.json())
  .then(data => console.log('Tracking:', data));
```

### Data Export

Properties can be exported to Excel format:

```javascript
// Using existing excel-export.js
const exportAuctionData = async () => {
    const response = await fetch('/api/auction/properties');
    const properties = await response.json();
    
    // Format for export
    const exportData = properties.map(p => ({
        'Auction ID': p.auction_id,
        'Address': p.address,
        'Current Bid': p.current_bid,
        'Min Bid': p.minimum_bid,
        'Zillow Estimate': p.zillow_estimate,
        'Profit Potential': p.profit_potential,
        'ROI %': p.roi_percentage,
        'Closing Time': p.closing_time,
        'Has Bids': p.has_bids ? 'Yes' : 'No'
    }));
    
    // Trigger download
    downloadExcel(exportData, 'auction-properties.xlsx');
};
```

---

## Monitoring & Maintenance

### Health Checks

```javascript
// api/auction/health.js
export default async function handler(req, res) {
    const checks = {
        database: await checkDatabase(),
        scraper: await checkScraper(),
        apis: await checkAPIs()
    };
    
    res.status(200).json({
        status: 'healthy',
        checks,
        lastScrape: await getLastScrapeTime()
    });
}
```

### Error Handling

All modules include comprehensive error handling:

```javascript
try {
    // Operation
} catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
    
    // Log to Supabase
    await supabase.from('error_logs').insert({
        module: 'auction-scraper',
        error: error.message,
        stack: error.stack,
        timestamp: new Date()
    });
    
    // Notify if critical
    if (error.critical) {
        await notifyAdmin(error);
    }
}
```

### Performance Optimization

1. **Caching Strategy**
   - Cache Zillow data for 24 hours
   - Cache street view images permanently
   - Update auction data every 15 minutes

2. **Database Optimization**
   - Use indexes on frequently queried columns
   - Implement pagination for large result sets
   - Use materialized views for complex calculations

3. **Scraping Optimization**
   - Batch requests to avoid rate limiting
   - Use connection pooling
   - Implement retry logic with exponential backoff

---

## Troubleshooting

### Common Issues

1. **Scraper Authentication Fails**
   - Check credentials in environment variables
   - Verify account is active on auction site
   - Clear cookies and retry

2. **Zillow API Rate Limits**
   - Implement caching layer
   - Reduce request frequency
   - Use backup data sources

3. **Database Connection Issues**
   - Verify Supabase credentials
   - Check network connectivity
   - Review connection pool settings

4. **Vercel Deployment Errors**
   - Check function size limits
   - Verify environment variables
   - Review build logs

---

## Security Considerations

1. **API Keys**
   - Never commit keys to repository
   - Use environment variables
   - Rotate keys regularly

2. **Database Access**
   - Use row-level security in Supabase
   - Limit service key usage
   - Audit database access

3. **Scraping Ethics**
   - Respect robots.txt
   - Implement rate limiting
   - Use proper user agent strings

---

## Future Enhancements

1. **Machine Learning Integration**
   - Predict winning bid amounts
   - Identify undervalued properties
   - Forecast market trends

2. **Mobile Application**
   - React Native app for on-the-go monitoring
   - Push notifications for bid changes
   - Offline capability

3. **Advanced Analytics**
   - Historical bid analysis
   - Neighborhood trend tracking
   - Investment portfolio optimization

4. **Automation Features**
   - Auto-bidding within parameters
   - Smart alerts based on criteria
   - Integration with property management systems

---

## Support & Contact

For questions or issues with this implementation:
- Review existing code in the Framework Real Estate Solutions repository
- Check Vercel and Supabase documentation
- Test API endpoints using the provided examples

This documentation provides everything needed to implement and maintain the Wayne County Auction Property Analysis Tool using the existing Framework Real Estate Solutions infrastructure.