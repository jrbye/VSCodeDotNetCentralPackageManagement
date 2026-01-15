# Testing Documentation

## Overview

This document describes the unit test suite for the .NET Central Package Management VS Code extension.

## Test Suite Structure

The test suite is organized into three main test files, each testing a core component of the extension:

### 1. xmlService.test.ts
Tests XML file parsing and manipulation functionality.

**What it tests:**
- Parsing Directory.Packages.props files
- Extracting package versions and item groups
- Handling labeled and unlabeled ItemGroups
- Reading .csproj files
- Detecting version conflicts (packages with Version attributes in .csproj)

**Key test cases:**
- Valid XML parsing
- Multiple item groups with labels
- Single item group handling
- Empty item group handling
- PropertyGroup handling (should be ignored)
- Package reference extraction from .csproj files
- Version conflict detection

### 2. nugetService.test.ts
Tests NuGet API integration for package searching and version management.

**What it tests:**
- Searching NuGet.org for packages
- Retrieving package versions
- Getting detailed package information
- Detecting outdated packages
- Version comparison logic

**Key test cases:**
- Package search with query
- Result limiting
- Version retrieval for valid packages
- Handling non-existent packages
- Package information fetching
- Outdated package detection
- Semantic version comparison

**Note:** These tests make real API calls to NuGet.org and have a 10-second timeout.

### 3. cpmManager.test.ts
Tests the core CPM management logic that coordinates between XML parsing and NuGet services.

**What it tests:**
- Package listing and retrieval
- Alphabetical sorting of projects
- Package usage tracking
- Version conflict detection across projects
- Item group management

**Key test cases:**
- Get all packages with sorting
- Get item groups
- Alphabetically sorted project retrieval
- Package usage tracking across multiple projects
- Version conflict detection
- Initial state validation

## Running Tests

### Prerequisites
```bash
# Install dependencies (including test dependencies)
npm install
```

### Run All Tests
```bash
# Compile and run tests in VS Code Extension Host
npm test
```

**Important**: These tests run in VS Code's Extension Host environment, not in regular Node.js. The test runner will:
1. Download a minimal VS Code instance (if not already cached)
2. Launch VS Code with the extension loaded
3. Run the tests inside the VS Code environment
4. Report results back to the console

This is necessary because the extension code imports the `vscode` module, which is only available inside VS Code's extension host.

### Run Tests in Development
```bash
# Compile TypeScript
npm run compile

# Run tests (will launch VS Code Extension Host)
npm test
```

### Run Tests in VS Code Extension Host (Debug Mode)
To debug tests with breakpoints:
1. Open the project in VS Code
2. Set breakpoints in test files
3. Press `F5` to launch Extension Development Host
4. In the new VS Code window, open Command Palette (`Ctrl+Shift+P`)
5. Run "Developer: Run Extension Tests"
6. Breakpoints will be hit in the original VS Code window

### First Run
The first time you run tests, `@vscode/test-electron` will download a VS Code instance (~100MB). This is cached for future runs.

## Test Configuration

### TypeScript Configuration (tsconfig.json)
The TypeScript configuration includes both `src` and `test` directories:
```json
{
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", ".vscode-test"]
}
```

### Test Infrastructure
The test infrastructure consists of three main components:

1. **test/runTests.ts** - Entry point that launches VS Code Extension Host
   - Uses `@vscode/test-electron` to download and launch VS Code
   - Passes extension path and test path to VS Code
   - Disables other extensions during testing for isolation

2. **test/index.ts** - Test runner executed inside VS Code
   - Uses Mocha with TDD style
   - Discovers test files using glob patterns
   - Configures 15-second timeout for API calls
   - Returns results to the main process

3. **test/*.test.ts** - Individual test suites
   - Written in Mocha TDD style (suite/test/setup/teardown)
   - Have full access to VS Code API and extension code

### Test Runner Configuration (test/index.ts)
Mocha is configured with:
- **UI**: TDD (Test-Driven Development) style
- **Color output**: Enabled
- **Timeout**: 15000ms (15 seconds for NuGet API calls)

### Dependencies
- **@vscode/test-electron**: VS Code test runner (downloads and launches VS Code)
- **mocha**: Test framework
- **@types/mocha**: TypeScript definitions for Mocha
- **glob**: File pattern matching for finding test files
- **@types/glob**: TypeScript definitions for glob

## Writing New Tests

### Test File Structure
```typescript
import * as assert from 'assert';
import { YourService } from '../src/yourService';

suite('YourService Test Suite', () => {
    let service: YourService;

    setup(() => {
        // Initialize before each test
        service = new YourService();
    });

    teardown(() => {
        // Clean up after each test
        if (service && service.dispose) {
            service.dispose();
        }
    });

    test('should do something', () => {
        const result = service.doSomething();
        assert.strictEqual(result, expectedValue);
    });

    test('async test with custom timeout', async function() {
        this.timeout(5000); // Set custom timeout
        const result = await service.asyncOperation();
        assert.ok(result);
    });
});
```

### Best Practices

1. **Use descriptive test names**
   - Good: `'should return alphabetically sorted projects'`
   - Bad: `'test1'`

2. **Set appropriate timeouts for async tests**
   ```typescript
   test('API call test', async function() {
       this.timeout(10000); // 10 seconds for API calls
       // test code
   });
   ```

3. **Use strict assertions**
   ```typescript
   assert.strictEqual(actual, expected); // Preferred
   assert.equal(actual, expected); // Avoid (uses ==)
   ```

4. **Clean up resources**
   ```typescript
   teardown(() => {
       // Dispose of services, close connections, etc.
       service.dispose();
   });
   ```

5. **Mock external dependencies**
   - For file system operations, use mock data instead of actual files
   - For API calls, consider mocking in unit tests (integration tests can use real APIs)

6. **Test edge cases**
   - Empty inputs
   - Null/undefined values
   - Invalid data
   - Boundary conditions

## Test Coverage

Current test coverage includes:

- ✅ XML parsing and manipulation
- ✅ Package reference detection
- ✅ Version conflict detection
- ✅ NuGet API integration
- ✅ Package search and version retrieval
- ✅ CPM manager core logic
- ✅ Alphabetical sorting
- ✅ Project tracking

### Areas for Future Test Expansion

- [ ] Command handlers (addPackage, updateVersion, removePackage)
- [ ] Webview panels (PackageManagerPanel, AddPackagePanel)
- [ ] IntelliSense providers (CompletionProvider)
- [ ] Diagnostics provider
- [ ] File watchers and event handlers
- [ ] UI interaction tests
- [ ] Integration tests for complete workflows

## Continuous Integration

To add CI/CD:

### GitHub Actions Example
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
```

## Troubleshooting

### Error: Cannot find module 'vscode'
This error occurs when trying to run tests directly with Node.js instead of through the VS Code Extension Host.

**Solution**: Always use `npm test` which properly launches VS Code Extension Host. Never run:
- `node ./out/test/runTests.js` directly (without VS Code)
- `mocha ./out/test/**/*.test.js` directly

The `npm test` script uses `@vscode/test-electron` which handles launching VS Code properly.

### Tests failing with timeout
- Increase timeout for async tests: `this.timeout(15000)`
- Check internet connection for NuGet API tests
- First test run may take longer as VS Code is downloaded

### Type errors in tests
- Ensure `@types/mocha` is installed: `npm install --save-dev @types/mocha`
- Check TypeScript configuration includes test directory
- Run `npm install` after pulling new changes

### Cannot find test files
- Check that test files end with `.test.ts`
- Verify test files are in the `test` directory
- Ensure TypeScript has compiled: run `npm run compile`
- Check `out/test` directory exists and contains `.test.js` files

### VS Code download fails
- Check internet connection
- The first run downloads ~100MB VS Code instance
- Downloaded VS Code is cached in `.vscode-test/` for future runs
- Delete `.vscode-test/` folder to re-download if corrupted

### Tests pass locally but fail in CI
- Ensure CI has display/X server (for Linux)
- Use xvfb for headless testing on Linux
- Set environment variable `DISPLAY=:99` if needed

## References

- [Mocha Documentation](https://mochajs.org/)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Node.js Assert Documentation](https://nodejs.org/api/assert.html)
