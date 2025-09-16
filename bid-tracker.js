const fs = require('fs').promises;
const path = require('path');

class BidTracker {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.historyDir = path.join(this.dataDir, 'bid-history');
        this.historyFile = path.join(this.historyDir, 'bid-history.json');
        this.snapshotsDir = path.join(this.historyDir, 'snapshots');
        this.currentPropertiesFile = path.join(this.dataDir, 'properties.json');

        this.bidHistory = {};
        this.currentProperties = [];
    }

    async initialize() {
        // Ensure directories exist
        await fs.mkdir(this.historyDir, { recursive: true });
        await fs.mkdir(this.snapshotsDir, { recursive: true });

        // Load existing bid history
        await this.loadBidHistory();

        // Load current properties
        await this.loadCurrentProperties();
    }

    async loadBidHistory() {
        try {
            const data = await fs.readFile(this.historyFile, 'utf8');
            this.bidHistory = JSON.parse(data);
            console.log(`Loaded bid history for ${Object.keys(this.bidHistory).length} properties`);
        } catch (error) {
            console.log('No existing bid history found, starting fresh');
            this.bidHistory = {};
        }
    }

    async loadCurrentProperties() {
        try {
            const data = await fs.readFile(this.currentPropertiesFile, 'utf8');
            let allProperties = JSON.parse(data);

            // Filter out bundle properties (those without closing times)
            this.currentProperties = allProperties.filter(p =>
                p.biddingCloses && p.biddingCloses !== 'N/A'
            );

            console.log(`Loaded ${this.currentProperties.length} individual properties (filtered out bundles)`);
        } catch (error) {
            console.error('Error loading current properties:', error);
            this.currentProperties = [];
        }
    }

    // Record a new bid snapshot
    async recordSnapshot(properties = null) {
        const timestamp = new Date().toISOString();
        const props = properties || this.currentProperties;

        if (!props || props.length === 0) {
            console.log('No properties to snapshot');
            return;
        }

        let newChanges = 0;
        let totalTracked = 0;

        for (const property of props) {
            const auctionId = property.auctionId;

            // Initialize history for new properties
            if (!this.bidHistory[auctionId]) {
                this.bidHistory[auctionId] = {
                    auctionId,
                    address: property.address,
                    city: property.city,
                    history: [],
                    metrics: {
                        totalChanges: 0,
                        bidVelocity: 0,
                        lastChangeHours: null,
                        totalIncrease: 0,
                        firstBid: property.currentBidNumeric || property.minimumBidNumeric,
                        competitionScore: 0
                    }
                };
            }

            const propertyHistory = this.bidHistory[auctionId];
            const lastSnapshot = propertyHistory.history[propertyHistory.history.length - 1];
            const currentBid = property.currentBidNumeric || property.minimumBidNumeric;

            // Check if bid has changed
            const hasChanged = !lastSnapshot || lastSnapshot.currentBid !== currentBid;

            if (hasChanged) {
                newChanges++;
            }

            // Add new snapshot
            const snapshot = {
                timestamp,
                currentBid,
                hasBids: property.hasBids || false,
                minimumBid: property.minimumBidNumeric,
                status: property.status
            };

            // Calculate change metrics if there was a change
            if (lastSnapshot && hasChanged) {
                snapshot.change = currentBid - lastSnapshot.currentBid;
                snapshot.changePercent = lastSnapshot.currentBid > 0
                    ? ((currentBid - lastSnapshot.currentBid) / lastSnapshot.currentBid) * 100
                    : 0;
            }

            propertyHistory.history.push(snapshot);
            totalTracked++;

            // Update metrics
            this.updateMetrics(propertyHistory);
        }

        // Save snapshot to file
        const snapshotFile = path.join(this.snapshotsDir, `snapshot-${Date.now()}.json`);
        await fs.writeFile(snapshotFile, JSON.stringify({
            timestamp,
            properties: props.map(p => ({
                auctionId: p.auctionId,
                currentBid: p.currentBidNumeric || p.minimumBidNumeric,
                hasBids: p.hasBids
            }))
        }, null, 2));

        // Save updated history
        await this.saveBidHistory();

        console.log(`Snapshot recorded: ${timestamp}`);
        console.log(`- ${totalTracked} properties tracked`);
        console.log(`- ${newChanges} bid changes detected`);

        return {
            timestamp,
            totalTracked,
            newChanges
        };
    }

    // Update metrics for a property
    updateMetrics(propertyHistory) {
        const history = propertyHistory.history;
        const metrics = propertyHistory.metrics;

        if (history.length < 2) return;

        // Count total changes (where bid actually changed)
        let changes = 0;
        for (let i = 1; i < history.length; i++) {
            if (history[i].currentBid !== history[i - 1].currentBid) {
                changes++;
            }
        }
        metrics.totalChanges = changes;

        // Calculate bid velocity (changes per day)
        const firstTime = new Date(history[0].timestamp);
        const lastTime = new Date(history[history.length - 1].timestamp);
        const daysDiff = (lastTime - firstTime) / (1000 * 60 * 60 * 24);
        metrics.bidVelocity = daysDiff > 0 ? changes / daysDiff : 0;

        // Find last change
        let lastChangeIndex = history.length - 1;
        for (let i = history.length - 1; i > 0; i--) {
            if (history[i].currentBid !== history[i - 1].currentBid) {
                lastChangeIndex = i;
                break;
            }
        }

        // Hours since last change
        if (lastChangeIndex > 0) {
            const lastChangeTime = new Date(history[lastChangeIndex].timestamp);
            const now = new Date();
            metrics.lastChangeHours = (now - lastChangeTime) / (1000 * 60 * 60);
        }

        // Total increase
        const firstBid = history[0].currentBid;
        const currentBid = history[history.length - 1].currentBid;
        metrics.totalIncrease = currentBid - firstBid;
        metrics.totalIncreasePercent = firstBid > 0
            ? ((currentBid - firstBid) / firstBid) * 100
            : 0;

        // Calculate competition score
        metrics.competitionScore = this.calculateCompetitionScore(propertyHistory);
    }

    // Calculate competition score based on bid history
    calculateCompetitionScore(propertyHistory) {
        const metrics = propertyHistory.metrics;
        const history = propertyHistory.history;
        let score = 0;

        // Factor 1: Number of bid changes (max 30 points)
        if (metrics.totalChanges >= 10) score += 30;
        else if (metrics.totalChanges >= 5) score += 20;
        else if (metrics.totalChanges >= 3) score += 10;
        else if (metrics.totalChanges >= 1) score += 5;

        // Factor 2: Bid velocity (max 25 points)
        if (metrics.bidVelocity >= 5) score += 25;  // 5+ changes per day
        else if (metrics.bidVelocity >= 2) score += 20;
        else if (metrics.bidVelocity >= 1) score += 15;
        else if (metrics.bidVelocity >= 0.5) score += 10;

        // Factor 3: Recent activity (max 20 points)
        if (metrics.lastChangeHours !== null) {
            if (metrics.lastChangeHours <= 1) score += 20;  // Changed in last hour
            else if (metrics.lastChangeHours <= 6) score += 15;
            else if (metrics.lastChangeHours <= 24) score += 10;
            else if (metrics.lastChangeHours <= 48) score += 5;
        }

        // Factor 4: Price increase percentage (max 15 points)
        if (metrics.totalIncreasePercent >= 50) score += 15;
        else if (metrics.totalIncreasePercent >= 25) score += 10;
        else if (metrics.totalIncreasePercent >= 10) score += 5;

        // Factor 5: Sudden spikes (max 10 points)
        let hasSpike = false;
        for (let i = 1; i < history.length; i++) {
            const change = history[i].changePercent || 0;
            if (change >= 20) {  // 20% jump in one update
                hasSpike = true;
                break;
            }
        }
        if (hasSpike) score += 10;

        return Math.min(score, 100);
    }

    // Get competition analysis for a property
    getPropertyCompetition(auctionId) {
        const history = this.bidHistory[auctionId];
        if (!history) return null;

        const metrics = history.metrics;
        const recentHistory = history.history.slice(-10); // Last 10 snapshots

        // Determine competition level
        let level;
        if (metrics.competitionScore >= 70) level = 'VERY HIGH';
        else if (metrics.competitionScore >= 50) level = 'HIGH';
        else if (metrics.competitionScore >= 30) level = 'MEDIUM';
        else if (metrics.competitionScore >= 10) level = 'LOW';
        else level = 'MINIMAL';

        // Predict future activity
        const prediction = this.predictFutureActivity(history);

        return {
            auctionId,
            address: history.address,
            competitionScore: metrics.competitionScore,
            level,
            metrics,
            recentHistory,
            prediction,
            insights: this.generateInsights(history)
        };
    }

    // Predict future bidding activity
    predictFutureActivity(history) {
        const metrics = history.metrics;
        const recent = history.history.slice(-5);

        // Check if activity is accelerating
        let isAccelerating = false;
        if (recent.length >= 3) {
            const recentChanges = recent.filter((s, i) => i > 0 && s.change).length;
            isAccelerating = recentChanges >= 2;
        }

        // Estimate final price based on velocity
        const currentBid = history.history[history.history.length - 1].currentBid;
        let estimatedFinal = currentBid;

        if (metrics.bidVelocity > 0 && metrics.totalIncreasePercent > 0) {
            // Simple linear projection
            const avgIncreasePerDay = (metrics.totalIncrease / Math.max(1, history.history.length - 1)) * metrics.bidVelocity;
            const daysRemaining = 3; // Assume 3 days average until closing
            estimatedFinal = currentBid + (avgIncreasePerDay * daysRemaining);
        }

        return {
            isAccelerating,
            estimatedFinalPrice: Math.round(estimatedFinal),
            confidenceLevel: metrics.totalChanges >= 5 ? 'HIGH' :
                           metrics.totalChanges >= 2 ? 'MEDIUM' : 'LOW',
            riskOfBiddingWar: metrics.competitionScore >= 60
        };
    }

    // Generate insights about the property
    generateInsights(history) {
        const insights = [];
        const metrics = history.metrics;

        // High competition insights
        if (metrics.competitionScore >= 70) {
            insights.push('⚠️ Very high competition - multiple active bidders');
        } else if (metrics.competitionScore >= 50) {
            insights.push('⚠️ High competition - expect bidding activity');
        }

        // Velocity insights
        if (metrics.bidVelocity >= 3) {
            insights.push('🔥 Rapid bidding - price increasing quickly');
        } else if (metrics.bidVelocity >= 1) {
            insights.push('📈 Steady bidding activity');
        } else if (metrics.totalChanges === 0) {
            insights.push('✅ No competition yet - potential opportunity');
        }

        // Recent activity
        if (metrics.lastChangeHours && metrics.lastChangeHours <= 1) {
            insights.push('🔴 Just bid on! Very recent activity');
        } else if (metrics.lastChangeHours && metrics.lastChangeHours <= 6) {
            insights.push('🟡 Recent activity in last 6 hours');
        } else if (metrics.lastChangeHours && metrics.lastChangeHours > 48) {
            insights.push('🟢 No recent activity for 2+ days');
        }

        // Price insights
        if (metrics.totalIncreasePercent >= 50) {
            insights.push(`💰 Price up ${metrics.totalIncreasePercent.toFixed(0)}% from start`);
        }

        return insights;
    }

    // Get hot properties (high recent activity)
    getHotProperties(limit = 20) {
        const properties = Object.values(this.bidHistory)
            .filter(p => p.metrics.totalChanges > 0)
            .sort((a, b) => {
                // Sort by recent activity (weight recent changes more)
                const scoreA = a.metrics.competitionScore + (a.metrics.lastChangeHours ? 100 / a.metrics.lastChangeHours : 0);
                const scoreB = b.metrics.competitionScore + (b.metrics.lastChangeHours ? 100 / b.metrics.lastChangeHours : 0);
                return scoreB - scoreA;
            })
            .slice(0, limit);

        return properties.map(p => ({
            auctionId: p.auctionId,
            address: p.address,
            city: p.city,
            competitionScore: p.metrics.competitionScore,
            totalChanges: p.metrics.totalChanges,
            lastChangeHours: p.metrics.lastChangeHours,
            currentBid: p.history[p.history.length - 1].currentBid,
            totalIncrease: p.metrics.totalIncrease,
            insights: this.generateInsights(p)
        }));
    }

    // Get properties with no competition
    getNoCompetitionProperties(limit = 20) {
        return Object.values(this.bidHistory)
            .filter(p => p.metrics.totalChanges === 0)
            .slice(0, limit)
            .map(p => ({
                auctionId: p.auctionId,
                address: p.address,
                city: p.city,
                currentBid: p.history[p.history.length - 1].currentBid
            }));
    }

    // Save bid history to file
    async saveBidHistory() {
        await fs.writeFile(this.historyFile, JSON.stringify(this.bidHistory, null, 2));
    }

    // Clean old snapshots (keep last 100)
    async cleanOldSnapshots() {
        const files = await fs.readdir(this.snapshotsDir);
        const snapshots = files.filter(f => f.startsWith('snapshot-')).sort();

        if (snapshots.length > 100) {
            const toDelete = snapshots.slice(0, snapshots.length - 100);
            for (const file of toDelete) {
                await fs.unlink(path.join(this.snapshotsDir, file));
            }
            console.log(`Cleaned ${toDelete.length} old snapshots`);
        }
    }

    // Get summary statistics
    getSummary() {
        const total = Object.keys(this.bidHistory).length;
        const withChanges = Object.values(this.bidHistory)
            .filter(p => p.metrics.totalChanges > 0).length;
        const highCompetition = Object.values(this.bidHistory)
            .filter(p => p.metrics.competitionScore >= 50).length;

        return {
            totalTracked: total,
            propertiesWithBidChanges: withChanges,
            highCompetitionProperties: highCompetition,
            averageCompetitionScore: total > 0
                ? Math.round(Object.values(this.bidHistory)
                    .reduce((sum, p) => sum + p.metrics.competitionScore, 0) / total)
                : 0
        };
    }
}

module.exports = BidTracker;

// Direct execution for testing
if (require.main === module) {
    async function test() {
        const tracker = new BidTracker();

        try {
            await tracker.initialize();

            // Record a snapshot
            const result = await tracker.recordSnapshot();
            console.log('\n📸 Snapshot Result:', result);

            // Get summary
            const summary = tracker.getSummary();
            console.log('\n📊 Summary:', summary);

            // Get hot properties
            const hot = tracker.getHotProperties(5);
            console.log('\n🔥 Hot Properties:', hot.length);
            if (hot.length > 0) {
                console.log('Top hot property:', hot[0]);
            }

            // Clean old snapshots
            await tracker.cleanOldSnapshots();

        } catch (error) {
            console.error('Error:', error);
        }
    }

    test();
}