import type { ModuleDefinition } from '../types';

export interface ModuleCSVRow {
  id: string;
  name: string;
  group: string;
  color: string;
  width: string;
  height: string;
  thumbnail: string;
  cadUrl: string;
  description: string;
  defaultParams: string;
  autodeskInventor?: string;
  price?: string;
  notification?: string;
  linkUrl?: string;
  ImSwitch?: string; // ImSwitch configuration data
  frameOnly?: string;
  framePosition?: string;
  frameOrientation?: string;
  docsUrl?: string;
  glbUrl?: string;
  glbOffsetX?: string;
  glbOffsetY?: string;
  glbOffsetZ?: string;
}

export function parseCSV(csvText: string): ModuleCSVRow[] {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(';');
  
  return lines.slice(1).map(line => {
    const values = line.split(';');
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || '';
    });
    return row as unknown as ModuleCSVRow;
  });
}

function addConfiguratorPrefix(path: string | undefined): string | undefined {
  if (!path) return path;
  
  // If the path starts with 'icons/' it's likely a user-created module from GitHub
  // Convert it to the full GitHub raw URL
  if (path.startsWith('icons/')) {
    return `https://raw.githubusercontent.com/beniroquai/openUC2-OptiKit-Store/main/${path}`;
  }
  
  // Only add prefix if path is relative and not already prefixed
  if (path.startsWith('/configurator/')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return '/configurator' + path;
  return '/configurator/' + path;
}

const GLB_STORE_BASE = 'https://raw.githubusercontent.com/openUC2/openUC2-OptiKit-GLBStore/main/';

function addGLBStorePrefix(path: string | undefined): string | undefined {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // Absolute URL path (e.g. /configurator/dev-glbs/…) — use as-is
  if (path.startsWith('/')) return path;
  // Relative path — prepend GLB store base
  return GLB_STORE_BASE + path;
}

export function csvRowToModuleDefinition(row: ModuleCSVRow): ModuleDefinition {
  let defaultParams = {};
  try {
    // Handle escaped quotes in CSV - more robust handling
    let cleanedParams = row.defaultParams;
    
    // Replace doubled quotes with single quotes
    cleanedParams = cleanedParams.replace(/""/g, '"');
    
    // If the string starts and ends with quotes, remove them
    if (cleanedParams.startsWith('"') && cleanedParams.endsWith('"')) {
      cleanedParams = cleanedParams.slice(1, -1);
    }
    
    defaultParams = JSON.parse(cleanedParams);
  } catch {
    console.warn(`Invalid defaultParams for module ${row.id}:`, row.defaultParams);
  }

  // Parse notification field
  let notification = '';
  if (row.notification && row.notification.trim()) {
    // Remove quotes and handle escaped quotes
    notification = row.notification.replace(/^"(.+)"$/, '$1').replace(/""/g, '"');
  }

  return {
    id: row.id,
    name: row.name,
    group: row.group,
    color: row.color,
    footprint: {
      width: parseInt(row.width, 10),
      height: parseInt(row.height, 10)
    },
    thumbnail: addConfiguratorPrefix(row.thumbnail),
    cadUrl: addConfiguratorPrefix(row.cadUrl),
    description: row.description,
    defaultParams,
    isWildCard: (defaultParams as { isWildCard?: boolean }).isWildCard || false,
    autodeskInventor: row.autodeskInventor,
    price: row.price ? parseFloat(row.price) : undefined,
    notification: notification || undefined,
    linkUrl: row.linkUrl || undefined,
    imSwitchConfig: row.ImSwitch || undefined, // Add ImSwitch configuration
    frameOnly: row.frameOnly === 'TRUE' || row.frameOnly === 'true',
    framePosition: row.framePosition || undefined,
    frameOrientation: row.frameOrientation || undefined,
    docsUrl: row.docsUrl || undefined,
    glbUrl: addGLBStorePrefix(row.glbUrl || undefined),
    glbOffset: (row.glbOffsetX || row.glbOffsetY || row.glbOffsetZ)
      ? [
          parseFloat(row.glbOffsetX || '0'),
          parseFloat(row.glbOffsetY || '0'),
          parseFloat(row.glbOffsetZ || '0')
        ] as [number, number, number]
      : undefined,
  };
}

export async function loadModulesFromCSV(csvUrl: string = '/configurator/modules_updated.csv'): Promise<ModuleDefinition[]> {
  try {
    // Always load local CSV first (contains standard modules)
    let standardModules: ModuleDefinition[] = [];
    try {
      const localResponse = await fetch(csvUrl);
      if (localResponse.ok) {
        const localCsvText = await localResponse.text();
        const localCsvRows = parseCSV(localCsvText);
        standardModules = localCsvRows.map(csvRowToModuleDefinition);
        console.log('Loaded standard modules from local CSV:', standardModules.length);
      } else {
        console.warn('Failed to load local CSV, using fallback modules');
        standardModules = getFallbackModules();
      }
    } catch (localError) {
      console.warn('Failed to load local CSV, using fallback modules:', localError);
      standardModules = getFallbackModules();
    }
    
    // Try to load user-created modules from external GitHub repository
    let userModules: ModuleDefinition[] = [];
    try {
      const externalResponse = await fetch('https://raw.githubusercontent.com/beniroquai/openUC2-OptiKit-Store/main/parts/parts.csv');
      if (externalResponse.ok) {
        const externalCsvText = await externalResponse.text();
        const externalCsvRows = parseCSV(externalCsvText);
        userModules = externalCsvRows.map(csvRowToModuleDefinition);
        console.log('Loaded user-created modules from external GitHub repository:', userModules.length);
      }
    } catch (externalError) {
      console.warn('Failed to load from external repository (this is optional):', externalError);
    }
    
    // Merge standard modules and user-created modules
    const allModules = [...standardModules, ...userModules];
    console.log('Total modules loaded:', allModules.length, '(standard:', standardModules.length, ', user-created:', userModules.length, ')');
    return allModules;
  } catch (error) {
    console.error('Error loading modules from CSV:', error);
    // Return fallback modules if everything fails
    return getFallbackModules();
  }
}

function getFallbackModules(): ModuleDefinition[] {
  return [
    {
      id: 'cube-1x1',
      name: 'Basic Cube',
      group: 'cubes',
      color: '#3498db',
      footprint: { width: 1, height: 1 },
      thumbnail: addConfiguratorPrefix('/icons/cube-1x1.svg'),
      defaultParams: { height: 50 }
    },
    {
      id: 'lens-1x1',
      name: 'Lens',
      group: 'lenses',
      color: '#f39c12',
      footprint: { width: 1, height: 1 },
      thumbnail: addConfiguratorPrefix('/icons/lens-1x1.svg'),
      defaultParams: { focalLength: 100 }
    }
  ];
}