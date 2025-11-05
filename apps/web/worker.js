/**
 * DISCLAIMER: This is a precompiled file that gets copied to the standalone build.
 * This file is used to start BullMQ workers in production/standalone mode.
 * It loads environment variables from .env and calls startBullMQWorkers() from instrumentation.js
 */

const path = require('path')
const fs = require('fs')

// Set up environment similar to server.js
process.env.NODE_ENV = 'production'
process.chdir(__dirname)

// Load environment variables from .env file (same as Next.js server.js does)
// Try to load .env file from the same directory
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  // Use dotenv to load the .env file
  try {
    // Try to use @next/env which Next.js uses
    const { loadEnvConfig } = require('next/dist/server/config-utils')
    loadEnvConfig(__dirname)
  } catch (err) {
    // Fallback to dotenv if @next/env is not available
    try {
      require('dotenv').config({ path: envPath })
    } catch (dotenvErr) {
      console.warn('Could not load .env file:', dotenvErr.message)
    }
  }
}

// In Docker standalone build, worker.js is at /app/worker.js
// and instrumentation.js is at /app/apps/web/.next/server/instrumentation.js
const instrumentationPath = path.join(__dirname, 'apps/web/.next/server/instrumentation.js')

if (!fs.existsSync(instrumentationPath)) {
  console.error('Could not find instrumentation.js at:', instrumentationPath)
  console.error('Current __dirname:', __dirname)
  process.exit(1)
}

// Start workers and keep process alive
async function startWorkers() {
  try {
    // Try ES module import first (Next.js compiles TS to ESM)
    const instrumentation = await import(instrumentationPath)
    
    if (instrumentation.startBullMQWorkers) {
      instrumentation.startBullMQWorkers()
      console.log('BullMQ workers started successfully')
    } else {
      throw new Error('startBullMQWorkers not found in instrumentation module')
    }
  } catch (importErr) {
    // Fallback: try CommonJS require
    try {
      // Clear require cache if needed
      delete require.cache[require.resolve(instrumentationPath)]
      const instrumentation = require(instrumentationPath)
      
      if (instrumentation.startBullMQWorkers) {
        instrumentation.startBullMQWorkers()
        console.log('BullMQ workers started successfully')
      } else {
        throw new Error('startBullMQWorkers not found in instrumentation module')
      }
    } catch (requireErr) {
      console.error('Failed to load instrumentation module')
      console.error('Import error:', importErr.message)
      console.error('Require error:', requireErr.message)
      console.error('Attempted path:', instrumentationPath)
      process.exit(1)
    }
  }
}

startWorkers().catch((err) => {
  console.error('Failed to start workers:', err)
  process.exit(1)
})

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

// Keep the process running - don't exit on errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  // Log but don't exit to keep workers running
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
  // Log but don't exit to keep workers running
})

