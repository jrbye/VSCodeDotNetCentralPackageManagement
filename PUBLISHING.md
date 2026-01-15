# Publishing Guide

## Logo Setup

The extension logo has been created as `icon.svg` (Concept 3: Package Network).

### Converting Logo to PNG for Marketplace

VS Code Marketplace requires a PNG icon. To convert the SVG to PNG:

**Option 1: Using Online Converter**
1. Open https://cloudconvert.com/svg-to-png or similar
2. Upload `icon.svg`
3. Set output size to 128x128 pixels (minimum required)
4. Download as `icon.png`
5. Place in the root directory

**Option 2: Using Inkscape (Free Desktop Tool)**
```bash
inkscape icon.svg --export-type=png --export-width=128 --export-height=128 --export-filename=icon.png
```

**Option 3: Using ImageMagick**
```bash
magick convert -background none -size 128x128 icon.svg icon.png
```

**Option 4: Using Node.js (sharp package)**
```bash
npm install --save-dev sharp
node -e "require('sharp')('icon.svg').resize(128,128).png().toFile('icon.png')"
```

## Pre-Publishing Checklist

### Required Files
- [x] `icon.svg` - Source logo (created)
- [ ] `icon.png` - PNG version for marketplace (needs conversion)
- [x] `README.md` - Extension documentation
- [x] `LICENSE` - License file (if not already present)
- [x] `CHANGELOG.md` - Version history (create if needed)

### package.json Requirements
- [x] `name` - Unique extension name
- [x] `displayName` - User-friendly name
- [x] `description` - Short description
- [x] `version` - Semantic version (currently 0.1.0)
- [x] `publisher` - Your VS Code Marketplace publisher ID
- [x] `icon` - Path to icon.png
- [x] `categories` - Extension categories
- [x] `keywords` - Search keywords
- [ ] `repository` - GitHub repository URL (recommended)
- [ ] `bugs` - Issue tracker URL (recommended)
- [ ] `homepage` - Extension homepage (recommended)
- [ ] `license` - License identifier (recommended)

### Testing Before Publishing
1. **Install locally for testing:**
   ```bash
   npm install -g @vscode/vsce
   vsce package
   code --install-extension vscode-dotnet-cpm-0.1.0.vsix
   ```

2. **Test all features:**
   - Activity bar icon appears
   - Package manager panel opens
   - Add package functionality works
   - Update/downgrade package works
   - Remove package works
   - Project selection works
   - All visual overlays display correctly

3. **Run tests:**
   ```bash
   npm test
   ```

### Publishing Steps

1. **Create VS Code Marketplace Publisher Account**
   - Go to https://marketplace.visualstudio.com/manage
   - Create a publisher ID if you haven't already
   - Update `publisher` field in package.json with your publisher ID

2. **Create Personal Access Token (PAT)**
   - Go to https://dev.azure.com
   - Create a new Personal Access Token with Marketplace > Manage permissions
   - Save the token securely

3. **Login to vsce**
   ```bash
   vsce login <your-publisher-id>
   ```

4. **Package the extension**
   ```bash
   vsce package
   ```
   This creates a `.vsix` file

5. **Publish to Marketplace**
   ```bash
   vsce publish
   ```

   Or publish manually:
   - Go to https://marketplace.visualstudio.com/manage
   - Click "New Extension" > "Visual Studio Code"
   - Upload the `.vsix` file

### Post-Publishing

1. **Verify listing:**
   - Check extension page on marketplace
   - Verify icon displays correctly
   - Test installation from marketplace

2. **Share:**
   - Add marketplace badge to README
   - Share on social media, forums, etc.

3. **Monitor:**
   - Watch for issues and feedback
   - Respond to reviews
   - Plan updates based on user feedback

## Version Updates

When publishing updates:

1. Update version in package.json (follow semantic versioning)
2. Update CHANGELOG.md with changes
3. Test thoroughly
4. Package and publish:
   ```bash
   vsce publish minor  # or major, patch
   ```

## Marketplace Badge

After publishing, add this badge to your README:

```markdown
[![VS Code Marketplace](https://img.shields.io/vscode-marketplace/v/JRBye.vscode-dotnet-cpm.svg)](https://marketplace.visualstudio.com/items?itemName=JRBye.vscode-dotnet-cpm)
[![Installs](https://img.shields.io/vscode-marketplace/i/JRBye.vscode-dotnet-cpm.svg)](https://marketplace.visualstudio.com/items?itemName=JRBye.vscode-dotnet-cpm)
[![Rating](https://img.shields.io/vscode-marketplace/r/JRBye.vscode-dotnet-cpm.svg)](https://marketplace.visualstudio.com/items?itemName=JRBye.vscode-dotnet-cpm)
```

## Additional Recommendations

### Add Repository Links
Update package.json:
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/vscode-dotnet-cpm"
  },
  "bugs": {
    "url": "https://github.com/yourusername/vscode-dotnet-cpm/issues"
  },
  "homepage": "https://github.com/yourusername/vscode-dotnet-cpm#readme"
}
```

### Add License
If not already present, add a LICENSE file (e.g., MIT):
```json
{
  "license": "MIT"
}
```

### Create CHANGELOG.md
Document all versions and changes:
```markdown
# Changelog

## [0.1.0] - 2025-01-XX
### Added
- Initial release
- Package manager UI
- Add/Update/Remove package functionality
- Project selection
- Category organization
- NuGet search integration
```
