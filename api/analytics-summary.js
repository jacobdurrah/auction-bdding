const fs = require('fs').promises;
const path = require('path');

// Helper function to get address key for matching
function getAddressKey(address, city = 'DETROIT', state = 'MI', zip = '') {
    if (!address) return null;
    return `${address}_${city}_${state}_${zip}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_');
}

// Calculate property score based on various factors
function calculateScore(property, zillow, geocode) {
    let score = 50; // Base score

    // Add points for good ROI based on Zillow estimate
    if (zillow && zillow.zestimate) {
        const roi = (zillow.zestimate - property.minimumBidNumeric) / property.minimumBidNumeric;
        if (roi > 3) score += 40;
        else if (roi > 2) score += 30;
        else if (roi > 1) score += 20;
        else if (roi > 0.5) score += 10;
    }

    // Add points for rental potential
    if (zillow && zillow.rentZestimate) {
        const annualRent = zillow.rentZestimate * 12;
        const rentYield = annualRent / property.minimumBidNumeric;
        if (rentYield > 0.2) score += 15; // 20%+ annual yield
        else if (rentYield > 0.15) score += 10;
        else if (rentYield > 0.1) score += 5;
    }

    // Reduce score if has bids (competition)
    if (property.hasBids) {
        score -= 25;
    }

    // Add points for low minimum bid
    if (property.minimumBidNumeric < 1000) score += 10;
    else if (property.minimumBidNumeric < 5000) score += 5;

    // Add points if geocoded (means property is locatable)
    if (geocode && geocode.latitude) score += 5;

    return Math.min(100, Math.max(0, score));
}

// Get recommendation based on score and factors
function getRecommendation(property, zillow, score) {
    const hasBids = property.hasBids;
    const roi = zillow && zillow.zestimate ?
        ((zillow.zestimate - property.minimumBidNumeric) / property.minimumBidNumeric * 100) : 0;

    if (score >= 80 && !hasBids) return 'STRONG BUY - Excellent opportunity with high ROI potential';
    if (score >= 70 && roi > 200) return 'HIGH PRIORITY - Great profit potential';
    if (score >= 60) return 'GOOD BUY - Worth considering';
    if (score >= 40) return 'CONSIDER - Research further';
    return 'SKIP - Better options available';
}

// Calculate competition level
function getCompetitionLevel(property) {
    if (!property.hasBids) return 'LOW';

    // Calculate bid intensity if there's a current bid
    if (property.currentBidNumeric && property.minimumBidNumeric) {
        const bidIncrease = (property.currentBidNumeric - property.minimumBidNumeric) / property.minimumBidNumeric;
        if (bidIncrease > 0.5) return 'HIGH';
        if (bidIncrease > 0.2) return 'MEDIUM';
    }

    return property.hasBids ? 'MEDIUM' : 'LOW';
}

// Calculate time until closing
function getTimeUntilClosing(closingTime) {
    if (!closingTime || closingTime === 'N/A') return null;

    const closing = new Date(closingTime);
    const now = new Date();
    const hoursUntilClosing = (closing - now) / (1000 * 60 * 60);

    return {
        hours: Math.floor(hoursUntilClosing),
        days: Math.floor(hoursUntilClosing / 24),
        isUrgent: hoursUntilClosing < 24,
        isSoon: hoursUntilClosing < 72
    };
}

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Read data files
        const dataDir = path.join(process.cwd(), 'data');

        // Load properties
        let properties = [];
        try {
            const propertiesData = await fs.readFile(path.join(dataDir, 'properties.json'), 'utf8');
            properties = JSON.parse(propertiesData);
        } catch (error) {
            console.error('Error loading properties:', error);
            return res.status(200).json({
                success: false,
                properties: [],
                stats: {},
                message: 'No properties data available'
            });
        }

        // Load Zillow data
        let zillowData = {};
        try {
            const zillowDataFile = await fs.readFile(path.join(dataDir, 'zillow-data.json'), 'utf8');
            zillowData = JSON.parse(zillowDataFile);
        } catch (error) {
            console.log('No Zillow data available');
        }

        // Load geocode data
        let geocodeData = {};
        try {
            const geocodeDataFile = await fs.readFile(path.join(dataDir, 'geocoded-properties.json'), 'utf8');
            geocodeData = JSON.parse(geocodeDataFile);
        } catch (error) {
            console.log('No geocode data available');
        }

        // Process and enhance properties with analytics
        const enhancedProperties = properties.map(prop => {
            // Get associated data
            const addressKey = getAddressKey(prop.address, prop.city || 'DETROIT', 'MI', prop.zip);
            const zillow = zillowData[addressKey] || null;
            const geocode = geocodeData[addressKey] || null;

            // Calculate analytics
            const score = calculateScore(prop, zillow, geocode);
            const competitionLevel = getCompetitionLevel(prop);
            const timeUntilClosing = getTimeUntilClosing(prop.biddingCloses);

            // Calculate ROI and profit potential
            const roi = zillow && zillow.zestimate ?
                ((zillow.zestimate - prop.minimumBidNumeric) / prop.minimumBidNumeric * 100) : 0;
            const potentialProfit = zillow && zillow.zestimate ?
                (zillow.zestimate - prop.minimumBidNumeric) : 0;
            const monthlyRentYield = zillow && zillow.rentZestimate ?
                (zillow.rentZestimate / prop.minimumBidNumeric * 100) : 0;

            // Generate links for quick access
            const links = {
                auction: `https://www.waynecountytreasurermi.com/AuctionPropertyDetails.aspx?AI_ID=${prop.auctionId}`,
                zillow: zillow && zillow.hdpUrl ? zillow.hdpUrl : null,
                streetView: geocode && geocode.latitude && geocode.longitude ?
                    `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${geocode.latitude},${geocode.longitude}` :
                    null
            };

            // Get property image
            const images = {
                primary: zillow && zillow.imgSrc ? zillow.imgSrc : null,
                streetView: zillow && zillow.streetView ? zillow.streetView : null
            };

            return {
                ...prop,
                // Include Zillow data for display
                zillow: zillow && !zillow.notFound ? {
                    zestimate: zillow.zestimate,
                    rentZestimate: zillow.rentZestimate,
                    yearBuilt: zillow.yearBuilt,
                    livingArea: zillow.livingArea,
                    bedrooms: zillow.bedrooms,
                    bathrooms: zillow.bathrooms,
                    homeType: zillow.homeType,
                    lotSize: zillow.lotSize,
                    imgSrc: zillow.imgSrc,
                    hdpUrl: zillow.hdpUrl,
                    streetView: zillow.streetView
                } : null,
                // Include geocode data
                geocode: geocode && geocode.latitude ? {
                    latitude: geocode.latitude,
                    longitude: geocode.longitude
                } : null,
                // Visual and navigation data
                images,
                links,
                // Analytics data
                analytics: {
                    overallScore: score,
                    recommendation: getRecommendation(prop, zillow, score),
                    competitionLevel,
                    timeUntilClosing,
                    isHiddenGem: !prop.hasBids && roi > 200,
                    isHotProperty: prop.hasBids && competitionLevel === 'HIGH',
                    metrics: {
                        roi: Math.round(roi),
                        potentialProfit: Math.round(potentialProfit),
                        monthlyRentYield: Math.round(monthlyRentYield * 10) / 10,
                        pricePerSqFt: zillow && zillow.livingArea ?
                            Math.round(prop.minimumBidNumeric / zillow.livingArea) : null
                    },
                    strategy: {
                        profit: {
                            roi,
                            potential: potentialProfit,
                            rating: roi > 200 ? 'Excellent' : roi > 100 ? 'Good' : roi > 50 ? 'Fair' : 'Poor'
                        },
                        competition: {
                            level: competitionLevel,
                            score: competitionLevel === 'LOW' ? 30 : competitionLevel === 'MEDIUM' ? 60 : 90
                        },
                        timing: timeUntilClosing ? {
                            urgency: timeUntilClosing.isUrgent ? 'HIGH' : timeUntilClosing.isSoon ? 'MEDIUM' : 'LOW',
                            hoursRemaining: timeUntilClosing.hours,
                            daysRemaining: timeUntilClosing.days
                        } : null
                    }
                }
            };
        }).filter(p => p.biddingCloses && p.biddingCloses !== 'N/A'); // Filter out bundles

        // Sort by score for recommendations
        const sortedByScore = [...enhancedProperties].sort((a, b) =>
            b.analytics.overallScore - a.analytics.overallScore
        );

        // Calculate statistics
        const stats = {
            total: enhancedProperties.length,
            withBids: enhancedProperties.filter(p => p.hasBids).length,
            withoutBids: enhancedProperties.filter(p => !p.hasBids).length,
            withZillow: enhancedProperties.filter(p => p.zillow).length,
            withGeocode: enhancedProperties.filter(p => p.geocode).length,
            withImages: enhancedProperties.filter(p => p.images.primary).length,
            competition: {
                low: enhancedProperties.filter(p => p.analytics.competitionLevel === 'LOW').length,
                medium: enhancedProperties.filter(p => p.analytics.competitionLevel === 'MEDIUM').length,
                high: enhancedProperties.filter(p => p.analytics.competitionLevel === 'HIGH').length
            },
            priceRanges: {
                under1k: enhancedProperties.filter(p => p.minimumBidNumeric < 1000).length,
                under5k: enhancedProperties.filter(p => p.minimumBidNumeric < 5000).length,
                under10k: enhancedProperties.filter(p => p.minimumBidNumeric < 10000).length,
                over10k: enhancedProperties.filter(p => p.minimumBidNumeric >= 10000).length
            },
            closingSoon: enhancedProperties.filter(p =>
                p.analytics.timeUntilClosing && p.analytics.timeUntilClosing.hours < 24
            ).length,
            averageMinBid: Math.round(
                enhancedProperties.reduce((sum, p) => sum + p.minimumBidNumeric, 0) / enhancedProperties.length
            )
        };

        // Identify special categories
        const hiddenGems = sortedByScore.filter(p => p.analytics.isHiddenGem).slice(0, 20);
        const hotProperties = enhancedProperties.filter(p => p.analytics.isHotProperty);
        const closingSoon = enhancedProperties
            .filter(p => p.analytics.timeUntilClosing && p.analytics.timeUntilClosing.hours < 48)
            .sort((a, b) => a.analytics.timeUntilClosing.hours - b.analytics.timeUntilClosing.hours);
        const bestDeals = sortedByScore.filter(p => !p.hasBids).slice(0, 10);

        res.status(200).json({
            success: true,
            properties: enhancedProperties,
            stats,
            recommendations: {
                topPicks: sortedByScore.slice(0, 10),
                hiddenGems,
                hotProperties,
                closingSoon: closingSoon.slice(0, 10),
                bestDeals
            },
            hiddenGems, // For backward compatibility
            lastUpdate: new Date().toISOString(),
            summary: {
                totalProperties: stats.total,
                propertiesWithBids: stats.withBids,
                propertiesWithZillow: stats.withZillow,
                propertiesWithImages: stats.withImages,
                averageScore: Math.round(
                    enhancedProperties.reduce((sum, p) => sum + p.analytics.overallScore, 0) / enhancedProperties.length
                )
            }
        });

    } catch (error) {
        console.error('Error in analytics summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load analytics data',
            message: error.message
        });
    }
};