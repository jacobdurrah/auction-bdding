const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const BidTracker = require('./bid-tracker');
const DataAggregator = require('./data-aggregator');
const AnalyticsEngine = require('./analytics-engine');

class UpdateScheduler {
    constructor() {
        this.bidTracker = new BidTracker();
        this.aggregator = new DataAggregator();
        this.engine = new AnalyticsEngine();
        
        this.dataDir = path.join(__dirname, 'data');
        this.scheduleFile = path.join(this.dataDir, 'update-schedule.json');
        
        // Update intervals based on urgency
        this.intervals = {
            immediate: 1 * 60 * 1000,       // 1 minute for properties closing in < 1 hour
            urgent: 5 * 60 * 1000,          // 5 minutes for properties closing in 1-3 hours
            regular: 10 * 60 * 1000,        // 10 minutes for properties closing in 3-6 hours
            standard: 60 * 60 * 1000        // 1 hour for all others
        };
        
        this.activeJobs = new Map();
        this.lastFullUpdate = null;
        this.updateHistory = [];
    }

    async initialize() {
        console.log('🚀 Initializing Update Scheduler');
        
        // Initialize components
        await this.bidTracker.initialize();
        await this.aggregator.initialize();
        await this.engine.loadData();
        
        // Load schedule history
        await this.loadScheduleHistory();
        
        console.log('✅ Update Scheduler initialized');
    }

    async loadScheduleHistory() {
        try {
            const data = await fs.readFile(this.scheduleFile, 'utf8');
            const schedule = JSON.parse(data);
            this.updateHistory = schedule.history || [];
            this.lastFullUpdate = schedule.lastFullUpdate;
        } catch (error) {
            // No history file yet
            this.updateHistory = [];
        }
    }

    async saveScheduleHistory() {
        const schedule = {
            lastFullUpdate: this.lastFullUpdate,
            history: this.updateHistory.slice(-100), // Keep last 100 updates
            activeJobs: Array.from(this.activeJobs.entries()).map(([id, job]) => ({
                id,
                type: job.type,
                nextRun: job.nextRun
            }))
        };
        
        await fs.writeFile(this.scheduleFile, JSON.stringify(schedule, null, 2));
    }

    // Determine update priority based on closing time
    getUpdatePriority(closingTime) {
        const now = new Date();
        const closing = new Date(closingTime);
        const hoursUntilClosing = (closing - now) / (1000 * 60 * 60);

        if (hoursUntilClosing <= 0) {
            return { priority: 'expired', interval: null };
        } else if (hoursUntilClosing <= 1) {
            return { priority: 'immediate', interval: this.intervals.immediate };  // < 1 hour: every minute
        } else if (hoursUntilClosing <= 3) {
            return { priority: 'urgent', interval: this.intervals.urgent };        // 1-3 hours: every 5 minutes
        } else if (hoursUntilClosing <= 6) {
            return { priority: 'regular', interval: this.intervals.regular };      // 3-6 hours: every 10 minutes
        } else {
            return { priority: 'standard', interval: this.intervals.standard };    // > 6 hours: every hour
        }
    }

    // Run auction scraper to get fresh data
    async scrapeAuctionData() {
        console.log('🔄 Starting auction data refresh...');
        
        return new Promise((resolve, reject) => {
            const scraper = spawn('node', ['parallel-scraper.js'], {
                env: {
                    ...process.env,
                    WORKERS: '10',
                    START_ID: '250900000',
                    END_ID: '250902570'
                }
            });
            
            let output = '';
            let errorOutput = '';
            
            scraper.stdout.on('data', (data) => {
                output += data.toString();
                // Log progress lines
                const lines = data.toString().split('\n').filter(line => line.trim());
                lines.forEach(line => {
                    if (line.includes('Progress') || line.includes('Complete')) {
                        console.log(`  ${line}`);
                    }
                });
            });
            
            scraper.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            scraper.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Auction data refresh complete');
                    resolve(output);
                } else {
                    console.error('❌ Scraper failed:', errorOutput);
                    reject(new Error(`Scraper exited with code ${code}`));
                }
            });
        });
    }

    // Update bid tracking and analytics
    async updateBidTracking() {
        console.log('📊 Updating bid tracking...');
        
        // Record new snapshot
        const snapshot = await this.bidTracker.recordSnapshot();
        
        // Get hot properties
        const hotProperties = this.bidTracker.getHotProperties(10);
        
        // Get competition summary
        const summary = this.bidTracker.getSummary();
        
        console.log(`  Snapshot: ${snapshot.totalTracked} properties, ${snapshot.newChanges} changes`);
        console.log(`  Hot properties: ${hotProperties.length}`);
        console.log(`  High competition: ${summary.highCompetitionProperties}`);
        
        return {
            snapshot,
            hotProperties,
            summary
        };
    }

    // Update analytics and aggregated data
    async updateAnalytics() {
        console.log('🧮 Updating analytics...');
        
        // Reload data
        await this.engine.loadData();
        this.engine.mergeData();
        
        // Export fresh analysis
        await this.engine.exportAnalysis();
        
        // Refresh aggregator cache
        await this.aggregator.refreshCache();
        
        console.log('✅ Analytics updated');
    }

    // Perform a full update cycle
    async performFullUpdate() {
        console.log('\n🔄 STARTING FULL UPDATE CYCLE');
        console.log('=' .repeat(50));
        
        const startTime = Date.now();
        const updateResult = {
            timestamp: new Date().toISOString(),
            type: 'full',
            success: false,
            duration: 0,
            changes: {}
        };
        
        try {
            // Step 1: Scrape fresh auction data
            await this.scrapeAuctionData();
            
            // Step 2: Update bid tracking
            const bidUpdate = await this.updateBidTracking();
            updateResult.changes.bids = bidUpdate;
            
            // Step 3: Update analytics
            await this.updateAnalytics();
            
            // Step 4: Clean old snapshots
            await this.bidTracker.cleanOldSnapshots();
            
            this.lastFullUpdate = new Date().toISOString();
            updateResult.success = true;
            
        } catch (error) {
            console.error('❌ Full update failed:', error);
            updateResult.error = error.message;
        }
        
        updateResult.duration = Math.round((Date.now() - startTime) / 1000);
        
        // Save to history
        this.updateHistory.push(updateResult);
        await this.saveScheduleHistory();
        
        console.log(`\n✅ Full update completed in ${updateResult.duration}s`);
        console.log('=' .repeat(50));
        
        return updateResult;
    }

    // Perform a quick bid-only update
    async performQuickUpdate() {
        console.log('\n⚡ QUICK BID UPDATE');
        
        const startTime = Date.now();
        const updateResult = {
            timestamp: new Date().toISOString(),
            type: 'quick',
            success: false,
            duration: 0,
            changes: {}
        };
        
        try {
            // Just scrape and track bids
            await this.scrapeAuctionData();
            const bidUpdate = await this.updateBidTracking();
            updateResult.changes.bids = bidUpdate;
            updateResult.success = true;
            
        } catch (error) {
            console.error('❌ Quick update failed:', error);
            updateResult.error = error.message;
        }
        
        updateResult.duration = Math.round((Date.now() - startTime) / 1000);
        
        // Save to history
        this.updateHistory.push(updateResult);
        await this.saveScheduleHistory();
        
        console.log(`✅ Quick update completed in ${updateResult.duration}s`);
        
        return updateResult;
    }

    // Schedule updates based on closing times
    async scheduleUpdates() {
        console.log('\n📅 Scheduling updates based on closing times');
        
        // Load current properties
        const propertiesFile = path.join(this.dataDir, 'properties.json');
        const propertiesData = await fs.readFile(propertiesFile, 'utf8');
        const properties = JSON.parse(propertiesData);
        
        // Group by priority
        const priorityGroups = {
            immediate: [],
            urgent: [],
            regular: [],
            standard: [],
            expired: []
        };
        
        properties.forEach(property => {
            const { priority } = this.getUpdatePriority(property.biddingCloses);
            priorityGroups[priority].push(property);
        });
        
        console.log('\nProperty distribution:');
        console.log(`  🔴 Immediate (< 1hr): ${priorityGroups.immediate.length}`);
        console.log(`  🟠 Urgent (< 6hr): ${priorityGroups.urgent.length}`);
        console.log(`  🟡 Regular (< 24hr): ${priorityGroups.regular.length}`);
        console.log(`  🟢 Standard (> 24hr): ${priorityGroups.standard.length}`);
        console.log(`  ⚫ Expired: ${priorityGroups.expired.length}`);
        
        // Schedule jobs for each priority level
        for (const [priority, interval] of Object.entries(this.intervals)) {
            if (priorityGroups[priority].length > 0 && !this.activeJobs.has(priority)) {
                this.scheduleJob(priority, interval);
            }
        }
        
        return priorityGroups;
    }

    // Schedule a recurring job
    scheduleJob(jobId, interval) {
        console.log(`⏱️  Scheduling ${jobId} updates every ${interval / 60000} minutes`);
        
        const job = {
            id: jobId,
            interval,
            type: jobId === 'immediate' || jobId === 'urgent' ? 'quick' : 'full',
            nextRun: new Date(Date.now() + interval),
            timer: setInterval(async () => {
                console.log(`\n🔔 Running scheduled ${jobId} update`);
                
                if (job.type === 'quick') {
                    await this.performQuickUpdate();
                } else {
                    await this.performFullUpdate();
                }
                
                job.nextRun = new Date(Date.now() + interval);
            }, interval)
        };
        
        this.activeJobs.set(jobId, job);
    }

    // Stop all scheduled jobs
    stopAllJobs() {
        console.log('\n🛑 Stopping all scheduled jobs');
        
        for (const [jobId, job] of this.activeJobs) {
            clearInterval(job.timer);
            console.log(`  Stopped: ${jobId}`);
        }
        
        this.activeJobs.clear();
    }

    // Get update status
    getStatus() {
        const jobs = Array.from(this.activeJobs.entries()).map(([id, job]) => ({
            id,
            type: job.type,
            interval: job.interval / 60000,
            nextRun: job.nextRun
        }));
        
        return {
            lastFullUpdate: this.lastFullUpdate,
            activeJobs: jobs,
            recentUpdates: this.updateHistory.slice(-10)
        };
    }

    // Run continuous monitoring
    async startMonitoring(options = {}) {
        console.log('\n🎯 STARTING CONTINUOUS MONITORING');
        console.log('=' .repeat(50));
        
        const {
            runInitialUpdate = true,
            enableScheduling = true
        } = options;
        
        await this.initialize();
        
        // Run initial full update
        if (runInitialUpdate) {
            await this.performFullUpdate();
        }
        
        // Schedule recurring updates
        if (enableScheduling) {
            await this.scheduleUpdates();
        }
        
        // Set up process handlers
        process.on('SIGINT', () => {
            console.log('\nReceived SIGINT, shutting down gracefully...');
            this.stopAllJobs();
            process.exit(0);
        });
        
        console.log('\n✅ Monitoring active. Press Ctrl+C to stop.');
        console.log('=' .repeat(50));
        
        // Keep process alive
        return new Promise(() => {});
    }
}

module.exports = UpdateScheduler;

// Direct execution
if (require.main === module) {
    async function run() {
        const scheduler = new UpdateScheduler();
        
        // Check for command line arguments
        const args = process.argv.slice(2);
        const command = args[0];
        
        if (command === 'once') {
            // Run one full update and exit
            await scheduler.initialize();
            await scheduler.performFullUpdate();
        } else if (command === 'quick') {
            // Run one quick update and exit
            await scheduler.initialize();
            await scheduler.performQuickUpdate();
        } else if (command === 'status') {
            // Show status and exit
            await scheduler.initialize();
            const status = scheduler.getStatus();
            console.log('\nScheduler Status:');
            console.log(JSON.stringify(status, null, 2));
        } else {
            // Start continuous monitoring
            await scheduler.startMonitoring();
        }
    }
    
    run().catch(console.error);
}