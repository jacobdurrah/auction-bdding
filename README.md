# Wayne County Auction Scraper

A robust web scraper for Wayne County tax auction properties using Playwright for reliable browser automation.

## Features

- ✅ Automated login with session management
- ✅ Scrape individual properties by auction ID
- ✅ Batch scraping with configurable ranges
- ✅ Rate limiting to avoid being blocked
- ✅ Comprehensive data extraction (bids, taxes, property details)
- ✅ Export to JSON and CSV formats
- ✅ API endpoint for integration
- ✅ Progress tracking and error handling

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

## Usage

### Command Line

#### Test the scraper
```bash
npm test
```

#### Run scraper for a specific range
```bash
# Scrape properties from ID 250900000 to 250900020
node run-scraper.js 250900000 250900020
```

#### Use with environment variables
```bash
AUCTION_USER="your_email@example.com" AUCTION_PASSWORD="your_password" node run-scraper.js
```

### API Usage

The scraper can be triggered via API endpoint (when deployed to Vercel):

```javascript
// POST request to scrape specific range
fetch('/api/auction/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        startId: 250900000,
        endId: 250900010,
        username: 'your_email@example.com',
        password: 'your_password'
    })
});

// Or scrape specific IDs
fetch('/api/auction/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        auctionIds: [250900001, 250900005, 250900010],
        username: 'your_email@example.com',
        password: 'your_password'
    })
});
```

### Programmatic Usage

```javascript
const WayneCountyAuctionScraper = require('./auction-scraper');

async function example() {
    const scraper = new WayneCountyAuctionScraper({
        username: 'your_email@example.com',
        password: 'your_password',
        headless: true
    });

    await scraper.initialize();
    await scraper.login();

    // Scrape single property
    const property = await scraper.scrapePropertyById(250900001);
    console.log(property);

    // Scrape range
    const properties = await scraper.scrapePropertyRange(250900000, 250900010);
    console.log(properties);

    await scraper.close();
}
```

## Data Structure

Each scraped property contains:

```javascript
{
    "auctionId": "250900001",
    "parcelId": "12345678",
    "address": "123 Main St",
    "city": "Detroit",
    "zip": "48201",
    "minimumBid": "$500.00",
    "minimumBidNumeric": 500,
    "currentBid": "$1,500.00",
    "currentBidNumeric": 1500,
    "hasBids": true,
    "status": "Active",
    "sevValue": "$25,000.00",
    "sevValueNumeric": 25000,
    "biddingCloses": "2024-01-15 3:00 PM",
    "summerTax": "$500.00",
    "winterTax": "$500.00",
    "legalDescription": "LOT 123 BLOCK 45",
    "scrapedAt": "2024-01-10T10:30:00.000Z"
}
```

## Configuration

Environment variables in `.env`:

```bash
# Required
AUCTION_USER=your_email@example.com
AUCTION_PASSWORD=your_password

# Optional
SCRAPER_HEADLESS=true         # Run browser in headless mode
SCRAPER_BATCH_SIZE=10         # Properties per batch
SCRAPER_DELAY_MS=1000         # Delay between batches (ms)
```

## Output Files

The scraper creates two output files:

1. **JSON file**: Complete data with all fields
   - Format: `auction-data-TIMESTAMP.json`

2. **CSV file**: Simplified format for spreadsheets
   - Format: `auction-data-TIMESTAMP.csv`
   - Columns: auctionId, parcelId, address, city, zip, minimumBid, currentBid, hasBids, status, sevValue, biddingCloses, summerTax, winterTax

## Error Handling

The scraper includes robust error handling:
- Automatic retry on network errors
- Graceful handling of missing properties
- Session persistence across requests
- Detailed error logging

## Rate Limiting

To avoid being blocked:
- Default delay of 1 second between batches
- Batch size of 10 properties
- User-agent spoofing
- Session management

## Troubleshooting

### Login fails
- Verify credentials in `.env` file
- Check if account is active on auction site
- Try running with `headless: false` to see browser

### No data returned
- Property might not exist
- Property might be removed from auction
- Check if logged in successfully

### Rate limiting errors
- Increase `SCRAPER_DELAY_MS`
- Decrease `SCRAPER_BATCH_SIZE`
- Run scraper during off-peak hours

## Development

### Project Structure
```
/
├── auction-scraper.js      # Main scraper class
├── test-scraper.js         # Test script
├── run-scraper.js          # CLI runner
├── api/
│   └── auction/
│       └── scrape.js       # API endpoint
├── package.json
├── .env.example
└── README.md
```

### Testing
```bash
# Run test with visible browser
SCRAPER_HEADLESS=false npm test

# Test specific property
node -e "
const s = require('./auction-scraper');
(async () => {
    const scraper = new s({username: 'email', password: 'pass'});
    await scraper.initialize();
    await scraper.login();
    const data = await scraper.scrapePropertyById(250900001);
    console.log(data);
    await scraper.close();
})();"
```

## License

ISC