# Notification System Guide

The openUC2 OptiKit configurator includes a comprehensive notification system to display important safety warnings, requirements, and notices to users.

## How to Use Notifications

### 1. Module-Level Notifications

Add notifications to individual modules by including a `notification` field in the module CSV file:

```csv
id;name;group;color;width;height;thumbnail;cadUrl;description;defaultParams;autodeskInventor;price;notification
cube-1x1;Basic Cube;cubes;#1e4670;1;1;/icons/cube.svg;/cad/cube.stl;Basic cube;{};ASS-001;10;"Achtung: Nur noch wenige verfügbar!"
```

**When displayed**: Module notifications appear automatically when a user places the module on the grid.

**Example use cases**:
- Stock warnings: "Limited availability!"  
- Safety notices: "⚠️ Laser safety glasses required"
- Requirements: "Requires electronics module for power"

### 2. Setup-Level Notifications

Add notifications to entire optical setups using the notification field in setup metadata:

```json
{
  "setupMetadata": {
    "name": "Laser Microscope",
    "author": "Dr. Smith", 
    "notification": "⚠️ LASER SAFETY: Always wear appropriate safety glasses when using this setup. Ensure proper ventilation."
  },
  "modules": [...],
  "annotations": [...]
}
```

**When displayed**: Setup notifications appear when users import/load the setup configuration.

**Example use cases**:
- Safety warnings for laser setups
- Special requirements or prerequisites  
- Important operating instructions
- Compatibility notices

### 3. Testing Notifications

In the configurator's Property Panel:

1. Enter a notification message in the "Notification" field
2. Click "Test Notification" to preview how it will appear
3. The notification will show in the top-right corner for 6 seconds

## Technical Implementation

### CSV Format
- Use semicolon (`;`) as delimiter
- Wrap notification text in quotes if it contains special characters
- Escape internal quotes by doubling them (`""`)

### JSON Format  
- Include `notification` field in setup metadata
- Text will be displayed as entered (supports Unicode symbols)

### Display Behavior
- Notifications appear in top-right corner
- Auto-dismiss after 6 seconds (module) or 8 seconds (setup)
- Users can manually close by clicking the X button
- Only one notification shown at a time (newest replaces older)

## Best Practices

1. **Be Concise**: Keep messages under 200 characters
2. **Use Symbols**: ⚠️ for warnings, ℹ️ for info, ✅ for success  
3. **Prioritize Safety**: Always include safety warnings for laser or high-voltage setups
4. **Test First**: Use the preview function to check appearance
5. **Clear Language**: Write for international users, avoid jargon

## Examples

### Laser Safety Warning
```
⚠️ LASER SAFETY: Class 3B laser. Safety glasses required. Never look directly into beam.
```

### Electronics Requirement  
```
⚠️ This setup requires the UC2 Electronics Module for LED control and power distribution.
```

### Compatibility Notice
```
ℹ️ Optimized for 470nm excitation. Alternative wavelengths available in the HoloBox collection.
```

### Stock Warning
```
⚠️ Limited stock item - contact sales@openuc2.com for availability.
```