#!/usr/bin/env node

/**
 * OAuth Verification Script
 * Tests Google OAuth flow programmatically to verify configuration
 */

const { google } = require('googleapis');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

// Load Google client secret JSON file
const GOOGLE_CLIENT_SECRET_PATH = path.join(__dirname, '../.env.google_client_secret.json');

let CLIENT_ID, CLIENT_SECRET, REDIRECT_URI;

try {
  const clientSecretData = JSON.parse(fs.readFileSync(GOOGLE_CLIENT_SECRET_PATH, 'utf8'));
  CLIENT_ID = clientSecretData.web.client_id;
  CLIENT_SECRET = clientSecretData.web.client_secret;
  
  // Load environment variables for base URL
  require('dotenv').config({ path: path.join(__dirname, '../apps/web/.env') });
  REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/google`;
} catch (error) {
  console.error('❌ Failed to load Google client secret JSON file:', error.message);
  console.error('Make sure .env.google_client_secret.json exists in the root directory');
  process.exit(1);
}

console.log('🔍 OAuth Configuration Test');
console.log('============================');
console.log(`Client ID: ${CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`Client Secret: ${CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log(`Redirect URI: ${REDIRECT_URI}`);
console.log('');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing required environment variables');
  console.error('Make sure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in apps/web/.env');
  process.exit(1);
}

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Define required scopes
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/contacts'
];

async function testOAuthConfiguration() {
  try {
    console.log('🔗 Testing OAuth Configuration...');
    console.log('');

    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    console.log('📋 OAuth Configuration Summary:');
    console.log('===============================');
    console.log(`Client ID: ${CLIENT_ID}`);
    console.log(`Redirect URI: ${REDIRECT_URI}`);
    console.log(`Scopes: ${SCOPES.length} scopes configured`);
    console.log('');
    console.log('🔗 Generated Auth URL:');
    console.log(authUrl);
    console.log('');

    // Test URL validity
    console.log('🧪 Testing URL Components...');
    const url = new URL(authUrl);
    console.log(`✅ Protocol: ${url.protocol}`);
    console.log(`✅ Host: ${url.host}`);
    console.log(`✅ Path: ${url.pathname}`);
    
    const params = url.searchParams;
    console.log(`✅ Client ID param: ${params.get('client_id') ? 'Present' : 'Missing'}`);
    console.log(`✅ Redirect URI param: ${params.get('redirect_uri') ? 'Present' : 'Missing'}`);
    console.log(`✅ Scope param: ${params.get('scope') ? 'Present' : 'Missing'}`);
    console.log('');

    // Interactive test
    console.log('🚀 Interactive OAuth Test');
    console.log('==========================');
    console.log('1. Copy the auth URL above');
    console.log('2. Open it in your browser');
    console.log('3. Complete the OAuth flow');
    console.log('4. Copy the authorization code from the redirect URL');
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const authCode = await new Promise((resolve) => {
      rl.question('Enter the authorization code (or press Enter to skip): ', resolve);
    });

    rl.close();

    if (authCode.trim()) {
      console.log('🔄 Exchanging code for tokens...');
      
      const { tokens } = await oauth2Client.getToken(authCode);
      oauth2Client.setCredentials(tokens);
      
      console.log('✅ Successfully obtained tokens!');
      console.log(`Access token: ${tokens.access_token ? 'Present' : 'Missing'}`);
      console.log(`Refresh token: ${tokens.refresh_token ? 'Present' : 'Missing'}`);
      
      // Test API access
      console.log('');
      console.log('🧪 Testing API Access...');
      
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      
      console.log('✅ Successfully accessed user info!');
      console.log(`User: ${userInfo.data.email}`);
      console.log(`Name: ${userInfo.data.name}`);
      
      // Test Gmail API
      console.log('');
      console.log('📧 Testing Gmail API Access...');
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      
      console.log('✅ Successfully accessed Gmail!');
      console.log(`Gmail address: ${profile.data.emailAddress}`);
      console.log(`Messages total: ${profile.data.messagesTotal}`);
      
    } else {
      console.log('⏭️  Skipping token exchange test');
    }

    console.log('');
    console.log('✅ OAuth configuration test completed!');
    
  } catch (error) {
    console.error('❌ OAuth test failed:');
    console.error(error.message);
    
    if (error.message.includes('invalid_request')) {
      console.error('');
      console.error('🔍 Debugging Tips:');
      console.error('- Check that redirect URI matches exactly in Google Console');
      console.error('- Verify app name matches between OAuth client and consent screen');
      console.error('- Ensure all required scopes are configured');
      console.error('- Check if app needs verification or test users');
    }
  }
}

// Additional utility functions
function validateRedirectUri(uri) {
  const validPatterns = [
    /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app\/api\/auth\/callback\/google$/,
    /^http:\/\/localhost:3000\/api\/auth\/callback\/google$/
  ];
  
  return validPatterns.some(pattern => pattern.test(uri));
}

function checkEnvironmentVariables() {
  const required = ['NEXT_PUBLIC_BASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}

// Run the test
if (require.main === module) {
  if (!checkEnvironmentVariables()) {
    process.exit(1);
  }
  
  if (!validateRedirectUri(REDIRECT_URI)) {
    console.warn('⚠️  Warning: Redirect URI format may not be valid');
    console.warn(`Current URI: ${REDIRECT_URI}`);
  }
  
  testOAuthConfiguration().catch(console.error);
}

module.exports = { testOAuthConfiguration, validateRedirectUri };
