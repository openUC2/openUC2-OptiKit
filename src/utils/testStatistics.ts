import { trackUserVisit } from './statisticsHandler';

// Test function to manually trigger statistics collection
export async function testStatisticsCollection() {
  console.log('🧪 Testing statistics collection...');
  
  try {
    await trackUserVisit();
    console.log('✅ Statistics collection test completed');
    return true;
  } catch (error) {
    console.error('❌ Statistics collection test failed:', error);
    return false;
  }
}

// Add to window for debugging
if (typeof window !== 'undefined') {
  (window as any).testStatistics = testStatisticsCollection;
  console.log('🧪 Debug function available: testStatistics()');
}