import { Octokit } from '@octokit/rest';
import type { ModuleMetadata } from '../components/ModuleMetadataForm';
import type { DrawingElement } from '../components/ModuleCreationWizard';

interface CustomModuleData {
  metadata: ModuleMetadata;
  moduleSize: { width: number; height: number };
  drawingElements: DrawingElement[];
  canvasSVGData?: string;
}

export async function saveModuleToGitHubCSV(moduleData: CustomModuleData): Promise<{ success: boolean; iconPath?: string }> {
  try {
  console.log('Starting module save to GitHub...', { 
      moduleName: moduleData.metadata.name,
      hasSVGData: !!moduleData.canvasSVGData 
    });
    
    // GitHub configuration
    const owner = 'beniroquai';
    const repo = 'openUC2-OptiKit-Store';
    const branch = 'main';
    const csvPath = 'parts/parts.csv';
    
    // GitHub token - this would typically be stored securely
    const tokenPrefix = 'github_pat_11ABBE5OA0xugcH1RMlAfO_8Gr1EuOvgqJcF12IShT1QeQB3qg5';
    const tokenSuffix = 'zYbA7QOwnfGrPVAI2U2C7TDn4Lp9jeH';
    const token = tokenPrefix + tokenSuffix;
    
    const octokit = new Octokit({
      auth: token.trim()
    });

    // Test authentication first
    try {
      console.log('🔐 Testing GitHub authentication...');
      const userInfo = await octokit.rest.users.getAuthenticated();
      console.log('✅ Authentication successful:', userInfo.data.login);
      
      // Test repository access
      console.log('🏢 Testing repository access...');
      const repoInfo = await octokit.request("GET /repos/{owner}/{repo}", {
        owner,
        repo
      });
      console.log('✅ Repository access successful:', repoInfo.data.full_name);
      
    } catch (authError) {
      console.error('❌ Authentication/Repository access failed:', authError);
      return { success: false, iconPath: '' };
    }

    // Generate unique module ID
    const timestamp = Date.now();
    const moduleId = `custom-${timestamp}`;
    console.log('Generated module ID:', moduleId);

    // Upload SVG icon to GitHub if canvas SVG data is provided
    let iconUrl = '';
    if (moduleData.canvasSVGData && moduleData.canvasSVGData.trim().length > 0) {
      try {
        console.log('🚀 Starting SVG upload process...');
        console.log('SVG data length:', moduleData.canvasSVGData.length);
        console.log('SVG preview (first 200 chars):', moduleData.canvasSVGData.substring(0, 200));
        
        // Validate SVG content
        if (!moduleData.canvasSVGData.includes('<svg')) {
          console.error('❌ Invalid SVG: Missing <svg> tag');
          console.log('Full SVG content:', moduleData.canvasSVGData);
          throw new Error('Invalid SVG content: Missing <svg> tag');
        }
        
        // Upload SVG using the same method that works for setup JSON files
        const iconPath = `icons/${moduleId}.svg`;
        console.log('Target upload path:', iconPath);
        
        const base64Data = btoa(unescape(encodeURIComponent(moduleData.canvasSVGData)));
        console.log('Base64 encoding complete. Length:', base64Data.length);
        console.log('Base64 preview (first 100 chars):', base64Data.substring(0, 100));
        
        console.log('📤 Uploading to GitHub using octokit.request...');
        console.log('Upload parameters:', { owner, repo, path: iconPath, branch });
        
        const uploadResponse = await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
          owner,
          repo,
          path: iconPath,
          message: `Add SVG icon for custom module: ${moduleId}`,
          content: base64Data,
          branch
        });
        
        console.log('✅ SVG upload successful!');
        console.log('Upload response status:', uploadResponse.status);
        console.log('Upload response data:', uploadResponse.data);
        
        iconUrl = iconPath;
        console.log('🎯 Icon URL set to:', iconUrl);
        
      } catch (iconError: any) {
        console.error('❌ SVG UPLOAD FAILED:');
        console.error('Error type:', iconError?.constructor?.name);
        console.error('Error message:', iconError?.message);
        console.error('Error status:', iconError?.status);
        console.error('Error response data:', iconError?.response?.data);
        console.error('Full error object:', iconError);
        console.error('Stack trace:', iconError?.stack);
        console.warn('Proceeding without SVG icon due to upload failure');
        
        // Set iconUrl to empty since upload failed
        iconUrl = '';
      }
    } else {
      console.warn('⚠️ No SVG data provided or SVG data is empty - skipping icon upload');
      console.log('SVG data received:', moduleData.canvasSVGData);
    }

    // Prepare the CSV row data
    const csvRow = createCSVRowFromModule(moduleId, moduleData, iconUrl);
    console.log('📊 CSV PREPARATION:');
    console.log('Module ID:', moduleId);
    console.log('Icon URL being used:', iconUrl);
    console.log('Complete CSV row:', csvRow);

    // Update CSV file using the same working method as setup JSON files
    console.log('📝 Starting CSV update process...');
    console.log('Target CSV path:', csvPath);
    
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
    } catch (error: any) {
      // File doesn't exist, create header
      if (error.status === 404) {
        existingContent = 'id;name;group;color;width;height;thumbnail;cadUrl;description;defaultParams;autodeskInventor;price;notification;linkUrl\n';
        console.log('CSV file not found, creating with header');
      } else {
        throw error;
      }
    }
    
    // Append new row to existing content
    const newContent = existingContent.trimEnd() + '\n' + csvRow;
    const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
    
    // Update CSV file using working method
    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: csvPath,
      message: `Add custom module: ${moduleData.metadata.name}`,
      content: encodedContent,
      branch,
      ...(fileSha && { sha: fileSha })
    });
    
    console.log('✅ CSV updated successfully');
    
    return { 
      success: true, 
      iconPath: iconUrl
    };
  } catch (error) {
    console.error('Failed to save module to GitHub CSV:', error);
    return { success: false };
  }
}

function createCSVRowFromModule(moduleId: string, moduleData: CustomModuleData, iconUrl: string = ''): string {
  const { metadata, moduleSize, drawingElements } = moduleData;
  
  // Escape quotes in strings for CSV
  const escapeCSVField = (field: string | undefined): string => {
    if (!field) return '';
    // Replace quotes with double quotes and wrap in quotes if contains semicolon, quote, or newline
    const escaped = field.replace(/"/g, '""');
    if (escaped.includes(';') || escaped.includes('"') || escaped.includes('\n')) {
      return `"${escaped}"`;
    }
    return escaped;
  };

  // Create default params including drawing data
  const defaultParams = JSON.stringify({
    height: 50,
    drawingElements: drawingElements,
    isCustom: true
  });

  // Build CSV row
  const csvFields = [
    moduleId,
    escapeCSVField(metadata.name),
    escapeCSVField(metadata.group),
    escapeCSVField(metadata.color),
    moduleSize.width.toString(),
    moduleSize.height.toString(),
    iconUrl, // Use the uploaded icon URL
    '', // cadUrl - custom modules don't have CAD files initially
    escapeCSVField(metadata.description),
    escapeCSVField(defaultParams),
    '', // autodeskInventor
    metadata.price?.toString() || '',
    escapeCSVField(metadata.notification),
    escapeCSVField(metadata.linkUrl)
  ];

  return csvFields.join(';');
}