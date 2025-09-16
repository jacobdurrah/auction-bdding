// Simple scraper for Vercel using fetch instead of Playwright
const https = require('https');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // For Vercel, we'll return sample data or instruct to use local
    // Real scraping with Playwright doesn't work on Vercel

    const sampleProperties = [
        {
            auctionId: "250900001",
            address: "104 ENGLEWOOD",
            city: "DETROIT",
            zip: "48202",
            minimumBid: "$5,200",
            minimumBidNumeric: 5200,
            currentBid: "$5,100",
            currentBidNumeric: 5100,
            hasBids: true,
            status: "IN PROGRESS",
            sevValue: "$46,800",
            sevValueNumeric: 46800,
            biddingCloses: "2025-09-17T13:15:00.000Z",
            parcelId: "01003544"
        },
        {
            auctionId: "250900002",
            address: "2832 BRUSH",
            city: "DETROIT",
            zip: "48201",
            minimumBid: "$2,100",
            minimumBidNumeric: 2100,
            currentBid: null,
            currentBidNumeric: 0,
            hasBids: false,
            status: "IN PROGRESS",
            sevValue: "$108,000",
            sevValueNumeric: 108000,
            biddingCloses: "2025-09-17T13:15:00.000Z",
            parcelId: "01003818"
        },
        {
            auctionId: "250900003",
            address: "171 EDGEVALE",
            city: "DETROIT",
            zip: "48203",
            minimumBid: "$4,000",
            minimumBidNumeric: 4000,
            currentBid: null,
            currentBidNumeric: 0,
            hasBids: false,
            status: "IN PROGRESS",
            sevValue: "$11,500",
            sevValueNumeric: 11500,
            biddingCloses: "2025-09-17T13:15:00.000Z",
            parcelId: "01004519"
        }
    ];

    res.status(200).json({
        success: true,
        count: sampleProperties.length,
        properties: sampleProperties,
        note: "This is sample data. For real scraping, use the local version at http://localhost:3000"
    });
};