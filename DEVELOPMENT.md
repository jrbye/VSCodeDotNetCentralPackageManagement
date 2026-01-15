# Development Guide

## Local Development Setup

### Prerequisites
- Node.js 20.x or higher
- VS Code
- A test .NET workspace with `Directory.Packages.props` for testing

### Getting Started

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/jrbye/VSCodeDotNetCentralPackageManagement.git
   cd VSCodeDotNetCentralPackageManagement
   npm install
   ```

2. **Configure test workspace:**

   Edit `.vscode/launch.json` and update the workspace path to point to your test project:
   ```json
   {
     "name": "Run Extension",
     "args": [
       "--extensionDevelopmentPath=${workspaceFolder}",
       "${workspaceFolder}/../your-test-workspace"  // <-- Update this
     ]
   }
   ```

   Your test workspace should contain:
   - `Directory.Packages.props` (or `Directory.Build.props` with CPM enabled)
   - One or more `.csproj` files with `<PackageReference>` elements

3. **Compile:**
   ```bash
   npm run compile
   ```

4. **Run extension:**
   - Press `F5` in VS Code
   - Or use "Run > Start Debugging"
   - The Extension Development Host will launch with your test workspace

### Development Workflow

**Watch mode for continuous compilation:**
```bash
npm run watch
```

**Run tests:**
```bash
npm test
```

**Lint code:**
```bash
npm run lint
```

### Project Structure

```
vscode-dotnet-cpm/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── cpmManager.ts             # Core CPM management logic
│   ├── nugetService.ts           # NuGet API integration
│   ├── xmlService.ts             # XML parsing for .props/.csproj
│   ├── diagnosticsProvider.ts    # Version conflict detection
│   ├── completionProvider.ts     # IntelliSense support
│   ├── commands/                 # Command implementations
│   │   ├── addPackagePanel.ts
│   │   ├── updateVersion.ts
│   │   └── removePackage.ts
│   └── webview/                  # UI panels
│       ├── packageManagerPanel.ts
│       └── packageManagerPanelHtml.ts
├── test/                         # Unit tests
│   ├── xmlService.test.ts
│   ├── nugetService.test.ts
│   └── cpmManager.test.ts
└── out/                          # Compiled JavaScript (git-ignored)
```

### Debugging

**Debug extension code:**
1. Set breakpoints in `.ts` files
2. Press `F5` to launch Extension Development Host
3. Breakpoints will hit in the main VS Code window

**Debug tests:**
1. Set breakpoints in test files
2. Use "Extension Tests" launch configuration
3. Or run: `npm test` (tests run in VS Code extension host)

### Testing Changes

1. Make changes to TypeScript files
2. Compile: `npm run compile` (or use watch mode)
3. Press `F5` to test in Extension Development Host
4. Test with your real `.NET` workspace

### Common Development Tasks

**Add a new command:**
1. Create command file in `src/commands/`
2. Register in `src/extension.ts`
3. Add to `package.json` contributes.commands
4. Add menu items in package.json if needed

**Modify UI:**
- Edit `src/webview/packageManagerPanelHtml.ts` for HTML/CSS/JS
- Changes to webview require reloading the extension

**Add NuGet API features:**
- Edit `src/nugetService.ts`
- Add caching for performance
- Handle errors gracefully

### Creating Test Workspace

If you need to create a test workspace from scratch:

1. **Create Directory.Packages.props:**
   ```xml
   <Project>
     <PropertyGroup>
       <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
     </PropertyGroup>
     <ItemGroup Label="Test Framework">
       <PackageVersion Include="NUnit" Version="4.0.0" />
       <PackageVersion Include="Mocha" Version="10.0.0" />
     </ItemGroup>
     <ItemGroup Label="Utilities">
       <PackageVersion Include="Newtonsoft.Json" Version="13.0.0" />
     </ItemGroup>
   </Project>
   ```

2. **Create a test .csproj:**
   ```xml
   <Project Sdk="Microsoft.NET.Sdk">
     <PropertyGroup>
       <TargetFramework>net8.0</TargetFramework>
     </PropertyGroup>
     <ItemGroup>
       <PackageReference Include="NUnit" />
       <PackageReference Include="Newtonsoft.Json" />
     </ItemGroup>
   </Project>
   ```

### Git Workflow

**Before committing:**
```bash
npm run compile  # Ensure it compiles
npm test         # Run tests
npm run lint     # Check for lint errors
```

**Note:** The `.vscode/launch.json` file is tracked in Git but points to a generic test workspace path. Update it locally for your development environment, but don't commit your local workspace path.

### Troubleshooting

**Extension not loading:**
- Check VS Code Developer Tools: Help > Toggle Developer Tools
- Look for errors in the console

**Changes not appearing:**
- Reload the Extension Development Host: Developer: Reload Window
- Or close and restart with F5

**Tests failing:**
- Ensure you're online (NuGet API tests require internet)
- Check that all dependencies are installed: `npm install`
- Tests run in VS Code extension host, not plain Node.js

**TypeScript errors:**
- Run `npm install` to ensure all types are installed
- Check `tsconfig.json` configuration
- Restart VS Code TypeScript server: TypeScript: Restart TS Server

## Additional Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Publishing Extensions](./PUBLISHING.md)
- [Testing Guide](./TESTING.md)
- [NuGet API Documentation](https://learn.microsoft.com/en-us/nuget/api/overview)
