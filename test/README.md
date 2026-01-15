# Unit Tests

This directory contains unit tests for the .NET Central Package Management extension.

## Running Tests

### Prerequisites
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in VS Code
1. Open the Extension Development Host by pressing `F5`
2. Open Command Palette (`Ctrl+Shift+P`)
3. Type "Developer: Run Extension Tests"

## Test Structure

### Test Files

- **xmlService.test.ts** - Tests for XML parsing and manipulation
  - Parsing Directory.Packages.props
  - Reading .csproj files
  - Detecting version conflicts

- **nugetService.test.ts** - Tests for NuGet API integration
  - Package search
  - Version retrieval
  - Package information fetching
  - Outdated package detection

- **cpmManager.test.ts** - Tests for core CPM logic
  - Package listing and sorting
  - Project management
  - Package usage tracking
  - Version conflict detection

## Test Coverage

The tests cover:
- ✅ XML file parsing (Directory.Packages.props)
- ✅ Project file parsing (.csproj)
- ✅ NuGet API integration
- ✅ Package version comparison
- ✅ CPM conflict detection
- ✅ Alphabetical sorting
- ✅ Package usage tracking

## Writing New Tests

When adding new tests:

1. Create a new `.test.ts` file or add to existing test file
2. Use the `suite()` and `test()` functions from Mocha
3. Use `assert` for assertions
4. Set appropriate timeouts for async tests (especially NuGet API calls)
5. Clean up resources in `teardown()` if needed

Example:
```typescript
import * as assert from 'assert';

suite('My New Feature Test Suite', () => {
    setup(() => {
        // Setup code
    });

    teardown(() => {
        // Cleanup code
    });

    test('should do something', () => {
        const result = myFunction();
        assert.strictEqual(result, expectedValue);
    });

    test('async test should work', async function() {
        this.timeout(5000); // Set timeout for async operations
        const result = await myAsyncFunction();
        assert.ok(result);
    });
});
```

## Notes

- Some tests make real API calls to NuGet.org and may be slow (10s timeout)
- Tests that require file system access are mocked to avoid side effects
- The test runner compiles TypeScript to JavaScript before running tests
