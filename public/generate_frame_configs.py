#!/usr/bin/env python3
"""
Frame Configuration Image Generator

This script generates preview images for different UC2 FRAME configurations
by compositing component images (FRAME base, LED modules, autofocus lasers, filters)
based on configuration names.

Configuration naming: frame_{lightSource}_{autofocus}_{fluorescence}
"""

from PIL import Image, ImageDraw, ImageFont
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional


# ============================================================================
# CONFIGURATION PARAMETERS
# ============================================================================

# Output canvas size
CANVAS_WIDTH = 1920
CANVAS_HEIGHT = 1080
CANVAS_COLOR = (255, 255, 255, 255)  # White background

# Component positions and scales (x, y, scale_factor)
# Positions are in pixels from top-left, scale is 0.0-1.0
COMPONENT_CONFIGS = {
    # Base FRAME positions (center of canvas)
    'frame_base': {
        'position': (960, 540),  # Center of 1920x1080 canvas
        'scale': 0.7,
        'anchor': 'center'  # center, top-left, etc.
    },
    
    # LED Matrix - top left
    'led_matrix': {
        'position': (300, 200),
        'scale': 0.2,
        'anchor': 'center',
        'label': 'LED Matrix',
        'label_offset': (0, 100)
    },
    
    # Single LED - top left (alternative to matrix)
    'led_1x': {
        'position': (300, 200),
        'scale': 0.2,
        'anchor': 'center',
        'label': '1 Channel LED',
        'label_offset': (0, 100)
    },
    
    # LED Ring - top left (alternative)
    'led_ring': {
        'position': (300, 200),
        'scale': 0.2,
        'anchor': 'center',
        'label': 'LED Ring',
        'label_offset': (0, 100)
    },
    
    # 4 Channel LED - right side
    'led_4x': {
        'position': (1500, 700),
        'scale': 0.25,
        'anchor': 'center',
        'label': '4 Channel LED',
        'label_offset': (0, 80)
    },
    
    # Autofocus laser overlay (on top of frame)
    'autofocus_laser': {
        'position': (600, 300),
        'scale': 0.15,
        'anchor': 'center'
    },
    
    # Filter indicators (appear based on channel count)
    'laser_1x': {
        'position': (1500, 300),
        'scale': 0.2,
        'anchor': 'center',
        'label': '1x Filter',
        'label_offset': (0, 80)
    },
    
    'laser_2x': {
        'position': (1500, 300),
        'scale': 0.2,
        'anchor': 'center',
        'label': '2x Filter',
        'label_offset': (0, 80)
    },
    
    'laser_4x': {
        'position': (1500, 300),
        'scale': 0.2,
        'anchor': 'center',
        'label': '4x Filter',
        'label_offset': (0, 80)
    }
}

# Title configuration
TITLE_CONFIG = {
    'position': (960, 100),
    'font_size': 300,
    'color': (30, 70, 112),  # Dark blue
    'font_family': 'arial.ttf'  # Will fall back to default if not available
}


# ============================================================================
# MAPPING RULES
# ============================================================================

def parse_config_name(filename: str) -> Dict[str, str]:
    """
    Parse configuration filename to extract components.
    
    Format: frame_{lightSource}_{autofocus}_{fluorescence}.svg
    
    Returns:
        Dict with keys: light_source, autofocus, fluorescence
    """
    # Remove extension and 'frame_' prefix
    basename = Path(filename).stem
    if basename.startswith('frame_'):
        basename = basename[6:]  # Remove 'frame_' prefix
    
    parts = basename.split('_')
    if len(parts) != 3:
        raise ValueError(f"Invalid config name format: {filename}")
    
    return {
        'light_source': parts[0],
        'autofocus': parts[1],
        'fluorescence': parts[2]
    }


def get_components_for_config(config: Dict[str, str]) -> List[Dict[str, any]]:
    """
    Determine which component images to use based on configuration.
    
    Returns:
        List of component dictionaries with 'image_name', 'config_key', 'label' keys
    """
    components = []
    
    # 1. Base FRAME (always included)
    # Determine if we need illumination arm based on autofocus
    has_illumination_arm = config['autofocus'] in ['laserastigmatism', 'imagecontrast']
    
    if has_illumination_arm:
        frame_base = 'FRAME_with_illuarm.png'
        label_suffix = "w/ Illumination Arm"
    else:
        frame_base = 'FRAME_without_illuarm.png'
        label_suffix = "without Illumination Arm"
    
    components.append({
        'image_name': frame_base,
        'config_key': 'frame_base',
        'label': f"FRAME {label_suffix}"
    })
    
    # 2. Light Source (LED Matrix, LED Ring, Single LED, or none)
    light_source_map = {
        'ledmatrix': ('led_matrix.png', 'led_matrix'),
        'ledring': ('led_matrix.png', 'led_ring'),  # Using matrix as placeholder
        'singleled': ('led_1x.png', 'led_1x'),
    }
    
    if config['light_source'] in light_source_map:
        img_name, config_key = light_source_map[config['light_source']]
        components.append({
            'image_name': img_name,
            'config_key': config_key,
            'label': None  # Will use label from COMPONENT_CONFIGS
        })
    
    # 3. Autofocus laser (if applicable)
    if config['autofocus'] == 'laserastigmatism':
        components.append({
            'image_name': 'autofocus_laser.png',
            'config_key': 'autofocus_laser',
            'label': None
        })
    
    # 4. Channel-specific components (filters and LED modules)
    # Determine channel count from light source
    channel_count = None
    
    if config['light_source'] == 'singleled':
        channel_count = 1
    elif config['light_source'] in ['ledmatrix', 'ledring']:
        # For matrix/ring, we'll assume 4x if fluorescence is enabled
        if config['fluorescence'] == 'fluo':
            channel_count = 4
        else:
            channel_count = 1
    
    # Add filter indicator based on channel count
    if channel_count:
        filter_map = {
            1: ('laser_1x.png', 'laser_1x'),
            2: ('laser_2x.png', 'laser_2x'),
            4: ('laser_4x.png', 'laser_4x')
        }
        
        if channel_count in filter_map:
            img_name, config_key = filter_map[channel_count]
            components.append({
                'image_name': img_name,
                'config_key': config_key,
                'label': None
            })
        
        # Add 4x LED module for 4-channel configs
        if channel_count == 4:
            components.append({
                'image_name': 'led_4x.webp',
                'config_key': 'led_4x',
                'label': None
            })
    
    return components


# ============================================================================
# IMAGE COMPOSITION
# ============================================================================

def load_and_scale_image(image_path: Path, scale: float) -> Image.Image:
    """Load and scale an image while preserving transparency."""
    img = Image.open(image_path)
    
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Calculate new size
    new_width = int(img.width * scale)
    new_height = int(img.height * scale)
    
    # Resize with high-quality resampling
    img_scaled = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    return img_scaled


def paste_image(canvas: Image.Image, component_img: Image.Image, 
                position: Tuple[int, int], anchor: str = 'center') -> None:
    """
    Paste a component image onto the canvas at the specified position.
    
    Args:
        canvas: The base canvas image
        component_img: The component image to paste
        position: (x, y) position
        anchor: Position anchor point ('center', 'top-left', etc.)
    """
    x, y = position
    
    # Adjust position based on anchor
    if anchor == 'center':
        x = x - component_img.width // 2
        y = y - component_img.height // 2
    elif anchor == 'top-left':
        pass  # Position is already top-left
    # Add more anchor types as needed
    
    # Paste with alpha channel for transparency
    canvas.paste(component_img, (x, y), component_img)


def add_text_label(canvas: Image.Image, text: str, position: Tuple[int, int],
                   font_size: int = 70, color: Tuple[int, int, int] = (0, 0, 0)) -> None:
    """Add a text label to the canvas."""
    draw = ImageDraw.Draw(canvas)
    
    # Try to load a nicer font, fall back to default
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
        except:
            font = ImageFont.load_default()
    
    # Get text bounding box for centering
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Center text at position
    x = position[0] - text_width // 2
    y = position[1] - text_height // 2
    
    # Draw text
    draw.text((x, y), text, fill=color, font=font)


def generate_title(config: Dict[str, str]) -> str:
    """Generate a descriptive title based on configuration."""
    light_source_names = {
        'ledmatrix': 'LED Matrix',
        'ledring': 'LED Ring',
        'singleled': 'Single LED',
        'none': 'No LED'
    }
    
    autofocus_names = {
        'laserastigmatism': 'Laser Autofocus',
        'imagecontrast': 'Image Contrast AF',
        'none': ''
    }
    
    fluo_suffix = ' + Fluorescence' if config['fluorescence'] == 'fluo' else ''
    
    light_name = light_source_names.get(config['light_source'], config['light_source'])
    
    # For 4-channel configs, modify the title
    if config['fluorescence'] == 'fluo' and config['light_source'] in ['ledmatrix', 'ledring']:
        title = f"FRAME 4 Channel {light_name}"
    else:
        title = f"FRAME {light_name}"
    
    af_name = autofocus_names.get(config['autofocus'], '')
    if af_name:
        title += f" {af_name}"
    
    return title


def generate_config_image(config_name: str, images_dir: Path, output_dir: Path) -> Path:
    """
    Generate a composite preview image for a given configuration.
    
    Args:
        config_name: Configuration filename (e.g., 'frame_ledmatrix_laserastigmatism_fluo.svg')
        images_dir: Directory containing component images
        output_dir: Directory to save output images
        
    Returns:
        Path to generated image
    """
    # Parse configuration
    config = parse_config_name(config_name)
    
    # Get components to include
    components = get_components_for_config(config)
    
    # Create canvas
    canvas = Image.new('RGBA', (CANVAS_WIDTH, CANVAS_HEIGHT), CANVAS_COLOR)
    
    # Composite each component
    for component in components:
        # Load image
        img_path = images_dir / component['image_name']
        if not img_path.exists():
            print(f"Warning: Component image not found: {img_path}")
            continue
        
        # Get component configuration
        config_key = component['config_key']
        comp_config = COMPONENT_CONFIGS.get(config_key)
        
        if not comp_config:
            print(f"Warning: No configuration found for: {config_key}")
            continue
        
        # Load and scale
        img = load_and_scale_image(img_path, comp_config['scale'])
        
        # Paste onto canvas
        paste_image(canvas, img, comp_config['position'], comp_config.get('anchor', 'center'))
        
        # Add label if specified
        label_text = component.get('label') or comp_config.get('label')
        if label_text and 'label_offset' in comp_config:
            label_pos = (
                comp_config['position'][0] + comp_config['label_offset'][0],
                comp_config['position'][1] + comp_config['label_offset'][1]
            )
            add_text_label(canvas, label_text, label_pos, font_size=70, color=(50, 50, 50))
    
    # Add title
    title_text = generate_title(config)
    add_text_label(
        canvas, 
        title_text, 
        TITLE_CONFIG['position'],
        font_size=TITLE_CONFIG['font_size'],
        color=TITLE_CONFIG['color']
    )
    
    # Convert to RGB for PNG saving (remove alpha)
    output_canvas = Image.new('RGB', canvas.size, (255, 255, 255))
    output_canvas.paste(canvas, (0, 0), canvas)
    
    # Save output
    output_filename = config_name.replace('.svg', '.png')
    output_path = output_dir / output_filename
    output_canvas.save(output_path, 'PNG', optimize=True)
    
    print(f"Generated: {output_path}")
    return output_path


# ============================================================================
# BATCH PROCESSING
# ============================================================================

def generate_all_configs(svg_dir: Path, images_dir: Path, output_dir: Path) -> None:
    """
    Generate preview images for all SVG configurations in a directory.
    
    Args:
        svg_dir: Directory containing SVG configuration files
        images_dir: Directory containing component images
        output_dir: Directory to save output images
    """
    # Create output directory if it doesn't exist
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Get all SVG files
    svg_files = list(svg_dir.glob('frame_*.svg'))
    
    if not svg_files:
        print(f"No SVG configuration files found in {svg_dir}")
        return
    
    print(f"Found {len(svg_files)} configuration files")
    print(f"Component images directory: {images_dir}")
    print(f"Output directory: {output_dir}")
    print("-" * 60)
    
    # Generate each configuration
    for svg_file in sorted(svg_files):
        try:
            generate_config_image(svg_file.name, images_dir, output_dir)
        except Exception as e:
            print(f"Error generating {svg_file.name}: {e}")
    
    print("-" * 60)
    print(f"Generation complete! {len(svg_files)} images saved to {output_dir}")


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main entry point for the script."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Generate UC2 FRAME configuration preview images'
    )
    parser.add_argument(
        '--svg-dir',
        type=Path,
        default=Path('frame_configs'),
        help='Directory containing SVG configuration files'
    )
    parser.add_argument(
        '--images-dir',
        type=Path,
        default=Path('frame_configs/IMAGES'),
        help='Directory containing component images'
    )
    parser.add_argument(
        '--output-dir',
        type=Path,
        default=Path('output'),
        help='Directory to save generated images'
    )
    parser.add_argument(
        '--config',
        type=str,
        help='Generate only a specific configuration (e.g., frame_ledmatrix_laserastigmatism_fluo.svg)'
    )
    
    args = parser.parse_args()
    
    # Validate directories
    if not args.images_dir.exists():
        print(f"Error: Images directory not found: {args.images_dir}")
        return
    
    if args.config:
        # Generate single configuration
        generate_config_image(args.config, args.images_dir, args.output_dir)
    else:
        # Generate all configurations
        generate_all_configs(args.svg_dir, args.images_dir, args.output_dir)


if __name__ == '__main__':
    main()
