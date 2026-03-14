import type {
  ObjectiveOption,
  LensOption,
  CameraOption,
  FluorescenceOption,
} from '../types/frameWizard';

function parseLibraryCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(';').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(';');
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });
    return row;
  });
}

function addPrefix(path: string | undefined): string | undefined {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/configurator/')) return path;
  if (path.startsWith('/')) return '/configurator' + path;
  return '/configurator/' + path;
}

export async function loadObjectives(): Promise<ObjectiveOption[]> {
  try {
    const response = await fetch('/configurator/objectives_library.csv');
    if (!response.ok) return [];
    const text = await response.text();
    const rows = parseLibraryCSV(text);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      manufacturer: row.manufacturer,
      magnification: parseFloat(row.magnification) || 0,
      na: parseFloat(row.na) || 0,
      workingDistance_mm: parseFloat(row.workingDistance_mm) || 0,
      focalLength_mm: parseFloat(row.focalLength_mm) || 0,
      immersion: row.immersion || 'air',
      threadType: row.threadType || 'RMS',
      parfocalDistance_mm: parseFloat(row.parfocalDistance_mm) || 45,
      fieldNumber_mm: parseFloat(row.fieldNumber_mm) || 20,
      correctionType: row.correctionType || 'achromatic',
      price: parseFloat(row.price) || 0,
      thumbnail: addPrefix(row.thumbnail),
      optilandJson: row.optilandJson || undefined,
      docsUrl: row.docsUrl || undefined,
    }));
  } catch (error) {
    console.error('Failed to load objectives library:', error);
    return [];
  }
}

export async function loadLenses(): Promise<LensOption[]> {
  try {
    const response = await fetch('/configurator/lenses_library.csv');
    if (!response.ok) return [];
    const text = await response.text();
    const rows = parseLibraryCSV(text);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      manufacturer: row.manufacturer,
      type: row.type || 'plano-convex',
      focalLength_mm: parseFloat(row.focalLength_mm) || 0,
      diameter_mm: parseFloat(row.diameter_mm) || 25.4,
      coating: row.coating || 'none',
      wavelengthRange_nm: row.wavelengthRange_nm || '400-700',
      mountType: row.mountType || 'none',
      price: parseFloat(row.price) || 0,
      thumbnail: addPrefix(row.thumbnail),
      optilandJson: row.optilandJson || undefined,
      docsUrl: row.docsUrl || undefined,
      partNumber: row.partNumber || undefined,
    }));
  } catch (error) {
    console.error('Failed to load lenses library:', error);
    return [];
  }
}

export async function loadCameras(): Promise<CameraOption[]> {
  try {
    const response = await fetch('/configurator/cameras_library.csv');
    if (!response.ok) return [];
    const text = await response.text();
    const rows = parseLibraryCSV(text);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      manufacturer: row.manufacturer,
      sensor: row.sensor || '',
      resolution: row.resolution || '',
      pixelSize_um: parseFloat(row.pixelSize_um) || 0,
      sensorSize_mm: row.sensorSize_mm || '',
      fps_max: parseInt(row.fps_max) || 0,
      interface: row.interface || 'USB3',
      bitDepth: parseInt(row.bitDepth) || 8,
      quantumEfficiency: parseFloat(row.quantumEfficiency) || 0,
      mountType: row.mountType || 'C-mount',
      cooled: row.cooled === 'true',
      price: parseFloat(row.price) || 0,
      thumbnail: addPrefix(row.thumbnail),
      docsUrl: row.docsUrl || undefined,
    }));
  } catch (error) {
    console.error('Failed to load cameras library:', error);
    return [];
  }
}

export async function loadFluorescenceOptions(): Promise<FluorescenceOption[]> {
  try {
    const response = await fetch('/configurator/fluorescence_library.csv');
    if (!response.ok) return [];
    const text = await response.text();
    const rows = parseLibraryCSV(text);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      dyeName: row.dyeName || '',
      excitationPeak_nm: parseFloat(row.excitationPeak_nm) || 0,
      emissionPeak_nm: parseFloat(row.emissionPeak_nm) || 0,
      lightSourceType: row.lightSourceType || 'LED',
      lightSourceWavelength_nm: row.lightSourceWavelength_nm || '',
      excitationFilterCenter_nm: parseFloat(row.excitationFilterCenter_nm) || 0,
      excitationFilterBandwidth_nm: parseFloat(row.excitationFilterBandwidth_nm) || 0,
      dichroicEdge_nm: parseFloat(row.dichroicEdge_nm) || 0,
      emissionFilterCenter_nm: parseFloat(row.emissionFilterCenter_nm) || 0,
      emissionFilterBandwidth_nm: parseFloat(row.emissionFilterBandwidth_nm) || 0,
      color: row.color || '#999',
      commonApplications: row.commonApplications || '',
      price_filterSet: parseFloat(row.price_filterSet) || 0,
    }));
  } catch (error) {
    console.error('Failed to load fluorescence library:', error);
    return [];
  }
}

export async function loadAllLibraries() {
  const [objectives, lenses, cameras, fluorescence] = await Promise.all([
    loadObjectives(),
    loadLenses(),
    loadCameras(),
    loadFluorescenceOptions(),
  ]);
  return { objectives, lenses, cameras, fluorescence };
}
