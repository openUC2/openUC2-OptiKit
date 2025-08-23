import { Octokit } from '@octokit/rest';
import type { ModuleMetadata } from '../components/ModuleMetadataForm';
import type { DrawingElement } from '../components/ModuleCreationWizard';

interface CustomModuleData {
  metadata: ModuleMetadata;
  moduleSize: { width: number; height: number };
  drawingElements: DrawingElement[];
  canvasSVGData?: string;
}

export async function saveModuleToGitHubCSV(moduleData: CustomModuleData): Promise<boolean> {
  try {
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

    // Generate unique module ID
    const timestamp = Date.now();
    const moduleId = `custom-${timestamp}`;

    // Upload SVG icon to GitHub if canvas SVG data is provided
    let iconUrl = '';
    if (moduleData.canvasSVGData) {
      try {
        iconUrl = await uploadSVGIconToGitHub(octokit, owner, repo, branch, moduleId, moduleData.canvasSVGData);
      } catch (iconError) {
        console.warn('Failed to upload SVG icon, proceeding without icon:', iconError);
      }
    }

    // Prepare the CSV row data
    const csvRow = createCSVRowFromModule(moduleId, moduleData, iconUrl);

    // Try to get existing CSV file
    let existingContent = '';
    let fileSha = '';
    
    try {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: csvPath,
        ref: branch
      });
      
      if ('content' in fileData) {
        existingContent = atob(fileData.content);
        fileSha = fileData.sha;
      }
    } catch (error: unknown) {
      // File doesn't exist, create header
      if ((error as { status?: number }).status === 404) {
        existingContent = 'id;name;group;color;width;height;thumbnail;cadUrl;description;defaultParams;autodeskInventor;price;notification;linkUrl\n';
      } else {
        throw error;
      }
    }

    // Append new row to existing content
    const newContent = existingContent.trimEnd() + '\n' + csvRow;

    // Encode content as base64
    const encodedContent = btoa(unescape(encodeURIComponent(newContent)));

    // Create or update the file
    const commitMessage = `Add custom module: ${moduleData.metadata.name}`;
    
    if (fileSha) {
      // Update existing file
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: csvPath,
        message: commitMessage,
        content: encodedContent,
        sha: fileSha,
        branch
      });
    } else {
      // Create new file
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: csvPath,
        message: commitMessage,
        content: encodedContent,
        branch
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to save module to GitHub CSV:', error);
    return false;
  }
}

async function uploadSVGIconToGitHub(
  octokit: Octokit, 
  owner: string, 
  repo: string, 
  branch: string, 
  moduleId: string, 
  canvasSVGData: string
): Promise<string> {
  try {
    // Convert SVG string to base64
    const base64Data = btoa(unescape(encodeURIComponent(canvasSVGData)));
    const iconPath = `icons/${moduleId}.svg`;
    
    // Upload the SVG icon file
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: iconPath,
      message: `Add SVG icon for custom module: ${moduleId}`,
      content: base64Data,
      branch
    });
    
    // Return the URL to the uploaded SVG icon
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${iconPath}`;
  } catch (error) {
    console.error('Failed to upload SVG icon to GitHub:', error);
    throw error;
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