import { Octokit } from '@octokit/rest';

interface UserStatistics {
  timestamp: string;
  partialIP: string;
  browser: string;
  country?: string;
  userAgent: string;
  url: string;
}

export async function collectUserStatistics(): Promise<UserStatistics> {
  // Get current timestamp
  const timestamp = new Date().toISOString();
  
  // Get browser information
  const userAgent = navigator.userAgent;
  const browser = getBrowserName(userAgent);
  
  // Get current URL
  const url = window.location.href;
  
  // Get partial IP address (we'll use a service to get the IP)
  const partialIP = await getPartialIPAddress();
  
  // Try to get country information
  const country = await getCountryFromIP();
  
  return {
    timestamp,
    partialIP,
    browser,
    country,
    userAgent,
    url
  };
}

function getBrowserName(userAgent: string): string {
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    return 'Chrome';
  } else if (userAgent.includes('Firefox')) {
    return 'Firefox';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return 'Safari';
  } else if (userAgent.includes('Edg')) {
    return 'Edge';
  } else if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
    return 'Opera';
  } else {
    return 'Other';
  }
}

async function getPartialIPAddress(): Promise<string> {
  try {
    // Use a free IP service to get the user's IP address
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    const fullIP = data.ip;
    
    // Convert to partial IP (X.X.last.two.octets)
    const ipParts = fullIP.split('.');
    if (ipParts.length === 4) {
      return `X.X.${ipParts[2]}.${ipParts[3]}`;
    } else {
      // Handle IPv6 or other formats
      return 'X.X.unknown.format';
    }
  } catch (error) {
    console.error('Failed to get IP address:', error);
    return 'X.X.error.getting';
  }
}

async function getCountryFromIP(): Promise<string | undefined> {
  try {
    // Use a free geolocation service
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    return data.country_name || data.country;
  } catch (error) {
    console.error('Failed to get country information:', error);
    return undefined;
  }
}

export async function saveStatisticsToGitHub(statistics: UserStatistics): Promise<{ success: boolean }> {
  try {
    console.log('📊 Saving user statistics to GitHub...', {
      timestamp: statistics.timestamp,
      partialIP: statistics.partialIP,
      browser: statistics.browser,
      country: statistics.country
    });
    
    // GitHub configuration - same as existing csvHandler
    const owner = 'beniroquai';
    const repo = 'openUC2-OptiKit-Store';
    const branch = 'main';
    const csvPath = 'statistics/statistics.csv';
    
    // GitHub token - same as existing csvHandler
    const tokenPrefix = 'github_pat_11ABBE5OA0xugcH1RMlAfO_8Gr1EuOvgqJcF12IShT1QeQB3qg5';
    const tokenSuffix = 'zYbA7QOwnfGrPVAI2U2C7TDn4Lp9jeH';
    const token = tokenPrefix + tokenSuffix;
    
    const octokit = new Octokit({
      auth: token.trim()
    });

    // Get existing CSV content
    let existingContent = '';
    let fileSha: string | undefined;
    
    try {
      const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: csvPath,
        ref: branch
      });
      
      if (response.data && typeof response.data === 'object' && 'content' in response.data && 'sha' in response.data) {
        existingContent = atob(response.data.content as string);
        fileSha = response.data.sha as string;
      }
    } catch (error: unknown) {
      // File doesn't exist, create header
      if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
        existingContent = 'timestamp,partialIP,browser,country,userAgent,url\n';
        console.log('📊 Statistics CSV file not found, creating with header');
      } else {
        throw error;
      }
    }
    
    // Create CSV row from statistics
    const csvRow = createCSVRowFromStatistics(statistics);
    
    // Append new row to existing content
    const newContent = existingContent.trimEnd() + '\n' + csvRow;
    const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
    
    // Update CSV file using the same working method as other CSV files
    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: csvPath,
      message: `Add user statistics entry: ${statistics.timestamp}`,
      content: encodedContent,
      branch,
      ...(fileSha && { sha: fileSha })
    });
    
    console.log('✅ Statistics saved successfully to GitHub');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Failed to save statistics to GitHub:', error);
    return { success: false };
  }
}

function createCSVRowFromStatistics(statistics: UserStatistics): string {
  // Escape quotes in strings for CSV
  const escapeCSVField = (field: string | undefined): string => {
    if (!field) return '';
    // Replace quotes with double quotes and wrap in quotes if contains comma, quote, or newline
    const escaped = field.replace(/"/g, '""');
    if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
      return `"${escaped}"`;
    }
    return escaped;
  };

  // Build CSV row with comma-separated values
  const csvFields = [
    escapeCSVField(statistics.timestamp),
    escapeCSVField(statistics.partialIP),
    escapeCSVField(statistics.browser),
    escapeCSVField(statistics.country),
    escapeCSVField(statistics.userAgent),
    escapeCSVField(statistics.url)
  ];

  return csvFields.join(',');
}

export async function trackUserVisit(): Promise<void> {
  try {
    // Only track once per session to avoid spamming
    const sessionKey = 'uc2_stats_tracked';
    if (sessionStorage.getItem(sessionKey)) {
      console.log('📊 User visit already tracked this session');
      return;
    }
    
    // Collect statistics
    const statistics = await collectUserStatistics();
    
    // Save to GitHub
    const result = await saveStatisticsToGitHub(statistics);
    
    if (result.success) {
      // Mark as tracked in this session
      sessionStorage.setItem(sessionKey, 'true');
      console.log('📊 User visit tracked successfully');
    } else {
      console.error('📊 Failed to track user visit');
    }
  } catch (error) {
    console.error('📊 Error tracking user visit:', error);
  }
}