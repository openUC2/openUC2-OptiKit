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
  // Only add prefix if path is relative and not already prefixed
  if (path.startsWith('/configurator/')) return path;
  if (path.startsWith('/')) return '/configurator' + path;
  return '/configurator/' + path;
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
    notification: notification || undefined
  };
}

export async function loadModulesFromCSV(csvUrl: string = '/configurator/modules_updated.csv'): Promise<ModuleDefinition[]> {
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Failed to load modules CSV: ${response.status}`);
    }
    
    const csvText = await response.text();
    const csvRows = parseCSV(csvText);
    return csvRows.map(csvRowToModuleDefinition);
  } catch (error) {
    console.error('Error loading modules from CSV:', error);
    // Return fallback modules if CSV fails to load
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