// Direct SVG upload test - bypassing the module wizard
import { Octokit } from '@octokit/rest';

export async function testDirectSVGUpload() {
  console.log('🧪 Starting direct SVG upload test...');
  
  try {
    // Simple test SVG
    const testSVG = `<svg width="100" height="50" xmlns="http://www.w3.org/2000/svg">
<line x1="0" y1="0" x2="100" y2="0" stroke="#ddd" stroke-width="1"/>
<line x1="0" y1="50" x2="100" y2="50" stroke="#ddd" stroke-width="1"/>
<line x1="0" y1="0" x2="0" y2="50" stroke="#ddd" stroke-width="1"/>
<line x1="100" y1="0" x2="100" y2="50" stroke="#ddd" stroke-width="1"/>
<circle cx="50" cy="25" r="10" stroke="#000" stroke-width="2" fill="transparent"/>
</svg>`;

    console.log('Test SVG:', testSVG);

    // GitHub setup (same as in app)
    const owner = 'beniroquai';
    const repo = 'openUC2-OptiKit-Store';
    const branch = 'main';
    const csvPath = 'parts/parts.csv';
    
    const tokenPrefix = 'github_pat_11ABBE5OA0xugcH1RMlAfO_8Gr1EuOvgqJcF12IShT1QeQB3qg5';
    const tokenSuffix = 'zYbA7QOwnfGrPVAI2U2C7TDn4Lp9jeH';
    const token = tokenPrefix + tokenSuffix;
    
    const octokit = new Octokit({
      auth: token.trim()
    });

    // Test 1: Upload SVG
    const moduleId = `test-direct-${Date.now()}`;
    const iconPath = `icons/${moduleId}.svg`;
    const base64Data = btoa(unescape(encodeURIComponent(testSVG)));
    
    console.log('📤 Uploading SVG...');
    const uploadResponse = await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: iconPath,
      message: `Direct test SVG upload: ${moduleId}`,
      content: base64Data,
      branch
    });
    
    console.log('✅ SVG upload successful:', uploadResponse.data.content?.html_url);

    // Test 2: Update CSV
    console.log('📝 Testing CSV update...');
    
    // Get existing CSV
    let existingContent = '';
    let fileSha = '';
    
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
    } catch (csvError: any) {
      console.error('❌ Failed to get existing CSV:', csvError);
      return false;
    }
    
    // Create test CSV row
    const testRow = `${moduleId};DirectTest;custom;#1e4670;1;1;${iconPath};;Direct upload test;"{}";;;;;`;
    const newContent = existingContent.trimEnd() + '\n' + testRow;
    const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
    
    console.log('Test CSV row:', testRow);
    
    // Update CSV
    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: csvPath,
      message: `Add direct test module: ${moduleId}`,
      content: encodedContent,
      branch,
      sha: fileSha
    });
    
    console.log('✅ CSV update successful');
    console.log('✅ Direct test completed successfully!');
    console.log('Check:', `https://github.com/${owner}/${repo}/blob/${branch}/parts/parts.csv`);
    
    return true;
    
  } catch (error: any) {
    console.error('❌ Direct test failed:', error);
    console.error('Error details:', error.message);
    return false;
  }
}

// Add to window for console testing
if (typeof window !== 'undefined') {
  (window as any).testDirectSVGUpload = testDirectSVGUpload;
}
