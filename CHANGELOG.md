# Changelog

All notable changes to the ".NET Central Package Management" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2025-01-15

### Fixed
- **Critical**: Fixed extension activation hanging issue that prevented the extension from loading
- Made initialization non-blocking to allow extension to activate immediately
- Added comprehensive error handling and logging to initialization process
- Added error handling for project scanning to prevent failures from blocking activation
- Improved console logging to help diagnose initialization issues

### Technical Changes
- Changed `cpmManager.initialize()` from blocking await to promise-based background initialization
- Wrapped project scanning in try-catch blocks to handle individual project failures gracefully
- Added detailed console logging throughout initialization process
- Diagnostics now update after successful initialization completes

## [0.1.0] - 2025-01-15 - Initial Release

### Added
- Central Package Management support for .NET projects
- Interactive Package Manager UI with two main panels:
  - Main Package Manager: Browse, update, and manage all centrally managed packages
  - Add Package Panel: Search NuGet.org and add new packages
- Package organization by labeled categories (e.g., Test Framework, Database Providers)
- Real-time package update detection with visual indicators
- Project selection for package installation
- Visual progress overlays for all operations (install, upgrade, downgrade, remove)
- Alphabetically sorted project lists
- Activity bar integration with automatic panel opening
- File system watchers for automatic refresh on changes
- Comprehensive NuGet API integration
- Package usage tracking (which projects use which packages)
- Support for both upgrade and downgrade operations
- Smart installation that preserves existing package installations
- Support for adding packages to multiple projects simultaneously
- Visual indicators showing which projects already have packages installed
- Category selection when adding new packages
- Detailed package information display (description, authors, download stats)
- Unit test suite with 21 tests covering core functionality
- Complete documentation (README, TESTING, PUBLISHING guides)

### Features
- **Directory.Packages.props Management**: Full support for .NET Central Package Management
- **NuGet Search**: Real-time search of NuGet.org packages
- **Version Management**: Upgrade, downgrade, or remove package versions
- **Multi-Project Support**: Manage packages across multiple projects in a solution
- **Visual Feedback**: Progress overlays and status indicators for all operations
- **Organized Categories**: Group packages by purpose with custom labels
- **Auto-Refresh**: File system watchers keep UI in sync with file changes

### Technical Details
- Built with TypeScript
- Uses fast-xml-parser for XML operations
- Axios for NuGet API integration
- Comprehensive error handling
- Mocha test framework with 21 passing tests
- VS Code Extension API integration
