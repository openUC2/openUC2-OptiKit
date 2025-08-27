# User Statistics Tracking Implementation

## Overview

The application now automatically tracks anonymous user statistics when users visit the website. This data is collected to provide insights into website usage while respecting user privacy.

## What Data is Collected

- **Timestamp**: When the visit occurred (ISO 8601 format)
- **Partial IP Address**: Only last 2 octets (format: X.X.123.456) for privacy
- **Browser Type**: Basic browser identification (Chrome, Firefox, Safari, etc.)
- **Country**: Geographic location (if detectable from IP)
- **User Agent**: Full browser user agent string
- **URL**: Current page URL

## How it Works

1. **Automatic Collection**: Statistics are collected when users first load the application
2. **Session-Based**: Only tracks once per browser session to avoid duplicate entries
3. **Privacy-Focused**: IP addresses are masked to only show last 2 octets
4. **GitHub Storage**: Data is saved to `statistics/statistics.csv` in the optikit-store repository

## Implementation Details

### Files Added/Modified

- `src/utils/statisticsHandler.ts` - Main statistics collection and saving logic
- `src/utils/testStatistics.ts` - Testing utilities for development
- `src/App.tsx` - Integration point for automatic tracking
- `src/main.tsx` - Debug functions for testing

### CSV Format

The statistics are saved in CSV format with the following columns:
```
timestamp,partialIP,browser,country,userAgent,url
```

### Privacy Measures

- **IP Masking**: Only the last two octets are stored (e.g., X.X.123.456)
- **Session Limiting**: One entry per browser session maximum
- **Anonymous Data**: No personally identifiable information is collected
- **Graceful Failures**: If external services fail, fallback values are used

## Production Considerations

In development, external API calls may be blocked by CORS policies. In production, you may want to:

1. **Use a Backend Proxy**: Route IP and geolocation services through your backend
2. **Configure CORS**: If hosting allows, configure proper CORS headers
3. **Alternative Services**: Use different IP/geolocation services with better CORS support
4. **Server-Side Collection**: Move statistics collection to server-side for better reliability

## Testing

Use the browser console to manually test statistics collection:
```javascript
// Test statistics collection
window.testStatistics()
```

## Error Handling

The implementation includes comprehensive error handling:
- Failed IP detection defaults to "X.X.error.getting"
- Failed country detection is gracefully ignored
- GitHub API failures are logged but don't crash the application
- Network errors are caught and logged for debugging