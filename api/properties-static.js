// Static properties endpoint for Vercel - serves pre-scraped data
const fs = require('fs').promises;
const path = require('path');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Read the committed JSON file
        const dataPath = path.join(process.cwd(), 'data', 'properties.json');

        let properties = [];
        let lastUpdated = null;

        try {
            const data = await fs.readFile(dataPath, 'utf8');
            properties = JSON.parse(data);

            // Get file stats for last update time
            const stats = await fs.stat(dataPath);
            lastUpdated = stats.mtime;
        } catch (error) {
            console.log('No properties.json found, returning empty array');
        }

        res.status(200).json({
            success: true,
            count: properties.length,
            properties: properties,
            lastUpdated: lastUpdated,
            isStatic: true,
            message: properties.length === 0
                ? 'No data available yet. Data needs to be scraped locally and pushed to GitHub.'
                : null
        });

    } catch (error) {
        console.error('Error reading properties:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load properties',
            details: error.message
        });
    }
};