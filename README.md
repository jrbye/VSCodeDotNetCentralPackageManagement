# .NET Central Package Management Extension for VS Code

A comprehensive Visual Studio Code extension that provides full support for managing NuGet packages using .NET's Central Package Management (CPM) feature.

## Features

### 📦 Centralized Package Version Management
- Manage all package versions in a single `Directory.Packages.props` file
- Automatic creation and management of `Directory.Build.props` for CPM enablement
- Support for organizing packages into labeled categories (e.g., Test Framework, Database Providers)
- Get visibility into package Vulnerabilities and potential Transitive Package Conflicts

### 🎯 Intuitive UI Panels

#### .NET Central Package Manager
- Browse all centrally managed packages organized by category
- View detailed package information including:
  - Description, authors, and download statistics
  - Which projects use each package
  - Available updates with visual indicators
- Upgrade/downgrade packages with visual feedback overlays
- Add or remove packages from specific projects with one click
- Remove packages entirely (from both Directory.Packages.props and all projects)
- Projects displayed in alphabetical order that maintains consistency

#### Add NuGet Package Panel
- Real-time search of NuGet.org packages
- View comprehensive package details and available versions
- Select specific projects to install packages into
- Visual indicators showing which projects already have a package installed
- Add packages to additional projects after initial installation
- Smart installation that preserves existing installations
- Category selection for organizing packages
- Pre-install vulnerability check warns before installing packages with known security issues
- "View Advisories" button opens security advisory URLs in your browser

### 🔍 Dependency Analysis
- **Transitive conflict detection** via `dotnet restore` (NU1608 warnings) and `dotnet list --include-transitive`
- **Security vulnerability scanning** via `dotnet list --vulnerable`
- CONFLICT and vulnerability badges on packages in the sidebar
- Analysis runs automatically at startup and on-demand via the "Analyze" button
- Full-screen analysis overlay with spinner during dependency analysis
- Configurable via `dotnetCpm.enableAnalysis` setting

### 🛡️ Security Vulnerability Badges
- Per-version vulnerability badges in both the Package Manager and Add Package version lists
- Vulnerability data sourced from the NuGet package registration API (GitHub Advisory Database)
- Severity badges (Low, Moderate, High, Critical) with tooltip showing vulnerability count
- Pre-install vulnerability warning dialog with option to view advisories or cancel

### 🔀 Transitive Dependency Warnings
- **Compatible / Conflict Risk** badges on each version in the version list
- Constraint data extracted from `project.assets.json` dependency graph
- Constraint banner showing which packages require which version
- Supports both exact (`[2.14.1]`) and minimum (`>= 2.14.1`) version constraints
- Badges update automatically when analysis completes

### 🔄 Real-time Features
- Automatic detection of package updates
- File system watchers for automatic refresh on changes
- Visual progress overlays for all operations (install, upgrade, downgrade, remove)
- Alphabetically sorted project lists that maintain order during operations
- Intelligent UI updates that prevent unnecessary re-renders
- Automatic refresh of package info, versions, and analysis badges when data changes

### ✨ IntelliSense Support
- Package name auto-completion in `Directory.Packages.props`
- Version number suggestions for packages
- Label/category suggestions

### ⚠️ Diagnostics
- Detection of version conflicts (packages with Version attributes in .csproj when CPM is enabled)
- Missing central definitions warnings
- Unused package detection

### ⚙️ Configuration Options
- `dotnetCpm.showPrereleaseVersions`: Toggle display of prerelease versions (alpha, beta, rc) in searches and version lists
- `dotnetCpm.enableAnalysis`: Enable/disable dependency analysis for transitive conflicts and security vulnerabilities (default: `true`)
- `dotnetCpm.dotnetPath`: Custom path to the dotnet executable (leave empty to use system PATH)

## Requirements

- Visual Studio Code 1.85.0 or higher
- .NET SDK (any version that supports Central Package Management)
- A workspace containing .NET projects

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac)
3. Search for ".NET Central Package Management"
4. Click Install

### From VSIX File
1. Download the `.vsix` file
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Type "Install from VSIX"
5. Select the downloaded file

## Getting Started

### Setting Up Central Package Management

1. **The extension automatically creates necessary files:**
   - `Directory.Build.props` - Enables CPM for all projects
   - `Directory.Packages.props` - Stores all package versions

2. **Update your .csproj files:**
   - Remove version numbers from PackageReference elements
   - Example:
   ```xml
   <!-- Before -->
   <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />

   <!-- After (CPM) -->
   <PackageReference Include="Newtonsoft.Json" />
   ```

### Using the Extension

1. **Open Package Manager:**
   - Click the package icon in the Activity Bar (left sidebar)
   - Or use Command Palette: `.NET CPM: Open Package Manager`

2. **Add a New Package:**
   - Click "Add Package" button in Package Manager
   - Or use Command Palette: `.NET CPM: Add Package`
   - Search for packages, select version, choose category, and select projects

3. **Update a Package:**
   - Click on a package in Package Manager
   - View available versions in the Versions pane
   - Click on desired version to upgrade/downgrade

4. **Manage Project References:**
   - Select a package in Package Manager
   - View Projects pane showing which projects use it
   - Click "Add" or "Remove" buttons to manage references

5. **Add Package to Additional Projects:**
   - In Add Package screen, packages already installed show which projects have them
   - Check additional projects and click "Add to Projects"
   - Already-installed projects are shown with checkmarks and disabled

## Commands

| Command | Description |
|---------|-------------|
| `.NET CPM: Open Package Manager` | Open the main package management panel |
| `.NET CPM: Add Package` | Search and add NuGet packages |
| `.NET CPM: Check for Package Upgrades` | Check all packages for available updates |
| `.NET CPM: Run Dependency Analysis` | Analyze transitive conflicts and security vulnerabilities |
| `.NET CPM: Refresh` | Refresh package and project information |
| `.NET CPM: Search NuGet Packages` | Open the package search panel |
| `.NET CPM: Open Directory.Packages.props` | Open the central package versions file |

## Extension Settings

This extension contributes the following settings:

* `dotnetCpm.showPrereleaseVersions`: Show prerelease versions (alpha, beta, rc) in package searches and version lists (default: `false`)
* `dotnetCpm.enableAnalysis`: Enable dependency analysis for transitive conflicts and security vulnerabilities (default: `true`)
* `dotnetCpm.dotnetPath`: Custom path to the dotnet executable. Leave empty to use the system PATH (default: `""`)

## How It Works

### Central Package Management
Central Package Management (CPM) is a NuGet feature that allows you to:
- Define all package versions in one location (`Directory.Packages.props`)
- Reference packages without versions in project files (`.csproj`)
- Ensure consistent versions across all projects in a solution

### File Structure
```
YourSolution/
├── Directory.Build.props          # Enables CPM for all projects
├── Directory.Packages.props       # Defines all package versions
├── Project1/
│   └── Project1.csproj           # References packages without versions
└── Project2/
    └── Project2.csproj           # References packages without versions
```

### Example Files

**Directory.Build.props:**
```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
</Project>
```

**Directory.Packages.props:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup Label="Test Framework">
    <PackageVersion Include="NUnit" Version="4.4.0" />
    <PackageVersion Include="Selenium.WebDriver" Version="4.39.0" />
  </ItemGroup>
  <ItemGroup Label="Database Providers">
    <PackageVersion Include="MongoDB.Driver" Version="3.5.2" />
  </ItemGroup>
</Project>
```

## Troubleshooting

### NU1010 Error: "PackageReference items do not define a corresponding PackageVersion item"
- **Cause:** CPM is enabled but package version is missing from Directory.Packages.props
- **Solution:** Add the package version to Directory.Packages.props or use the extension to add it

### NU1015 Error: "Package version cannot be specified"
- **Cause:** Package has Version attribute in .csproj when CPM is enabled
- **Solution:** Remove the Version attribute from PackageReference in .csproj

### Package Manager shows empty
- **Cause:** No Directory.Packages.props found
- **Solution:** The extension will create one automatically, or create it manually

### Changes not reflecting
- **Cause:** File system watcher may need refresh
- **Solution:** Use the Refresh command or restart VS Code

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/vscode-dotnet-cpm.git
cd vscode-dotnet-cpm

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run in Extension Development Host
# Press F5 in VS Code
```

### Running Tests

```bash
npm test
```

### Project Structure

```
vscode-dotnet-cpm/
├── src/
│   ├── extension.ts                # Extension entry point
│   ├── cpmManager.ts               # Core CPM logic
│   ├── nugetService.ts             # NuGet API integration & vulnerability DB
│   ├── xmlService.ts               # XML file operations
│   ├── dotnetCliService.ts         # dotnet CLI wrapper
│   ├── packageAnalysisService.ts   # Dependency analysis & transitive constraints
│   ├── completionProvider.ts       # IntelliSense support
│   ├── diagnosticsProvider.ts      # Error detection
│   ├── versionUtils.ts            # Semantic version comparison utilities
│   ├── commands/                   # Command implementations
│   │   ├── addPackage.ts
│   │   ├── addPackagePanel.ts
│   │   ├── updateVersion.ts
│   │   └── removePackage.ts
│   ├── treeView/                   # Tree data for commands
│   │   ├── packageTreeItem.ts
│   │   └── packageTreeProvider.ts
│   └── webview/                    # UI panels
│       ├── packageManagerPanel.ts
│       └── packageManagerPanelHtml.ts
├── test/                           # Unit tests
├── package.json                    # Extension manifest
└── tsconfig.json                   # TypeScript configuration
```

## Known Issues

- Large solution scans may take a few seconds on first load
- NuGet API rate limiting may affect searches with very rapid typing
- Initial dependency analysis runs against the entire solution; per-project incremental analysis is used for individual package changes
- Vulnerability badges only appear on versions visible in the top 20 of the version list
- The NuGet vulnerability database may not cover all packages; badges depend on data from the GitHub Advisory Database

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT

## Acknowledgments

- Built with the [VS Code Extension API](https://code.visualstudio.com/api)
- NuGet API powered by [NuGet.org](https://www.nuget.org/)
- Uses [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) for XML operations
- Uses [axios](https://github.com/axios/axios) for HTTP requests

## Changelog

### 0.2.0 - Dependency Analysis & Security
- Transitive dependency conflict detection via `dotnet restore` and `dotnet list`
- Security vulnerability scanning via `dotnet list --vulnerable`
- CONFLICT and vulnerability badges on packages in the sidebar
- Per-version vulnerability badges sourced from NuGet registration API (GitHub Advisory Database)
- Compatible / Conflict Risk badges on versions based on `project.assets.json` constraints
- Transitive constraint banner showing dependency requirements
- Pre-install vulnerability check with modal warning and "View Advisories" button
- Full-screen analysis overlay with spinner during dependency analysis
- Analysis runs automatically at startup and on-demand via the "Analyze" button
- Auto-refresh of info pane, versions pane, and analysis badges when data changes
- NuGet vulnerability database pre-loaded at startup for fast lookups
- New command: Run Dependency Analysis
- New command: Open Directory.Packages.props
- New settings: `enableAnalysis`, `dotnetPath`

### 0.1.0 - Initial Release
- Package management UI with categorized views
- Add, update, and remove packages
- Project-specific package management with add/remove buttons
- Real-time NuGet package search
- IntelliSense support for Directory.Packages.props
- Automatic CPM setup and configuration (Directory.Build.props)
- Visual progress indicators for all operations (install, upgrade, remove)
- Alphabetically sorted project lists
- Smart installation with existing package detection
- Install packages to subset of projects
- Add packages to additional projects after initial installation
- Removal overlays in Add Package screen
- Package icons with fallback
- Update indicators for packages
- Modal confirmation dialogs for destructive actions
- Race condition fixes for duplicate updates
- Comprehensive project usage tracking
