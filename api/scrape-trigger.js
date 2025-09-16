// Simplified API endpoint for Vercel that just returns cached data
const fs = require('fs').promises;
const path = require('path');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // On Vercel, we can't run Playwright
    // Instead, return a message to use local scraping
    res.status(200).json({
        success: false,
        message: 'Scraping must be run locally due to Vercel limitations. Please run the scraper locally and upload the data.',
        instructions: [
            '1. Run the scraper locally: npm start',
            '2. Click "Refresh All Auction Data" on http://localhost:3000',
            '3. The data will be saved locally',
            '4. Deploy updates with: vercel --prod'
        ]
    });
};