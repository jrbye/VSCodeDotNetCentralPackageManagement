import * as vscode from 'vscode';
import { CpmManager } from '../cpmManager';
import { NuGetService } from '../nugetService';

export class AddPackagePanel {
    public static currentPanel: AddPackagePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private cpmManager: CpmManager,
        private nugetService: NuGetService,
        private extensionUri: vscode.Uri
    ) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        this._setWebviewMessageListener(this._panel.webview);

        // Send installed packages list
        this._sendInstalledPackages();
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        cpmManager: CpmManager,
        nugetService: NuGetService
    ) {
        const column = vscode.ViewColumn.One;

        if (AddPackagePanel.currentPanel) {
            AddPackagePanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dotnetCpmAddPackage',
            'Add NuGet Package',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out')]
            }
        );

        AddPackagePanel.currentPanel = new AddPackagePanel(
            panel,
            cpmManager,
            nugetService,
            extensionUri
        );
    }

    private _sendInstalledPackages() {
        const installedPackages = this.cpmManager.getAllPackages().map(p => p.name);
        const allProjects = this.cpmManager.getAllProjects();

        // Build a map of package -> projects that use it
        const packageUsage: { [packageName: string]: string[] } = {};
        installedPackages.forEach(pkgName => {
            packageUsage[pkgName] = this.cpmManager.getPackageUsage(pkgName);
        });

        this._panel.webview.postMessage({
            type: 'installedPackages',
            packages: installedPackages,
            projects: allProjects.map(p => ({ name: p.name, path: p.path })),
            packageUsage: packageUsage
        });
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'searchPackages':
                        await this._handleSearchPackages(message.query);
                        break;
                    case 'getPackageDetails':
                        await this._handleGetPackageDetails(message.packageName);
                        break;
                    case 'getVersions':
                        await this._handleGetVersions(message.packageName);
                        break;
                    case 'installPackage':
                        await this._handleInstallPackage(message.packageName, message.version, message.category, message.projects);
                        break;
                    case 'removePackage':
                        await this._handleRemovePackage(message.packageName);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleSearchPackages(query: string) {
        try {
            const showPrerelease = vscode.workspace.getConfiguration('dotnetCpm').get<boolean>('showPrereleaseVersions', false);
            const results = await this.nugetService.searchPackages(query, showPrerelease, 50);
            this._panel.webview.postMessage({
                type: 'searchResults',
                results: results
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to search packages: ${error}`);
        }
    }

    private async _handleGetPackageDetails(packageName: string) {
        try {
            const packageInfo = await this.nugetService.getPackageInfo(packageName);
            this._panel.webview.postMessage({
                type: 'packageDetails',
                packageName: packageName,
                info: packageInfo
            });
        } catch (error) {
            console.error(`Failed to fetch package details for ${packageName}:`, error);
        }
    }

    private async _handleGetVersions(packageName: string) {
        try {
            const showPrerelease = vscode.workspace.getConfiguration('dotnetCpm').get<boolean>('showPrereleaseVersions', false);
            let versions = await this.nugetService.getPackageVersions(packageName);

            // Filter out prerelease versions if setting is disabled
            if (!showPrerelease) {
                versions = versions.filter(v => !v.includes('-'));
            }

            this._panel.webview.postMessage({
                type: 'versionsData',
                packageName: packageName,
                versions: versions.reverse()
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch versions for ${packageName}`);
        }
    }

    private async _handleInstallPackage(packageName: string, version: string, category: string, projectPaths: string[]) {
        try {
            // Notify webview that installation is in progress
            this._panel.webview.postMessage({
                type: 'installInProgress',
                packageName: packageName,
                version: version
            });

            // Check if package is already in Directory.Packages.props
            const existingPackage = this.cpmManager.getAllPackages().find(p => p.name === packageName);

            if (!existingPackage) {
                // First add the package to Directory.Packages.props
                const success = await this.cpmManager.addPackage(packageName, version, category || undefined);
                if (!success) {
                    this._panel.webview.postMessage({
                        type: 'installComplete',
                        success: false
                    });
                    vscode.window.showErrorMessage(`Failed to add package to Directory.Packages.props`);
                    return;
                }
            }

            // Then add PackageReference to selected projects
            if (projectPaths && projectPaths.length > 0) {
                for (const projectPath of projectPaths) {
                    await this.cpmManager.addPackageToProject(packageName, projectPath);
                }
            }

            this._panel.webview.postMessage({
                type: 'installComplete',
                success: true
            });

            this._panel.webview.postMessage({
                type: 'installSuccess',
                packageName: packageName
            });
            this._sendInstalledPackages();
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'installComplete',
                success: false
            });
            vscode.window.showErrorMessage(`Failed to install package: ${error}`);
        }
    }

    private async _handleRemovePackage(packageName: string) {
        try {
            // cpmManager.removePackage handles confirmation dialog
            const success = await this.cpmManager.removePackage(packageName);

            if (success) {
                // Notify webview that removal is in progress
                this._panel.webview.postMessage({
                    type: 'removeInProgress',
                    packageName: packageName
                });

                // Small delay to show the overlay
                await new Promise(resolve => setTimeout(resolve, 100));

                this._panel.webview.postMessage({
                    type: 'removeComplete',
                    success: true
                });

                this._panel.webview.postMessage({
                    type: 'packageRemoved',
                    packageName: packageName
                });
                this._sendInstalledPackages();
            } else {
                // User cancelled or removal failed - no message needed as cpmManager handles it
            }
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'removeComplete',
                success: false
            });
            vscode.window.showErrorMessage(`Failed to remove package: ${error}`);
        }
    }

    public dispose() {
        AddPackagePanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Add NuGet Package</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            overflow: hidden;
        }

        .container {
            display: flex;
            height: 100vh;
        }

        .search-panel {
            width: 400px;
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-sideBar-background);
        }

        .header {
            padding: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
        }

        .search-box {
            position: relative;
        }

        .search-box input {
            width: 100%;
            padding: 10px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 14px;
        }

        .search-box input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .results-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        }

        .package-result {
            padding: 12px 16px;
            cursor: pointer;
            border-left: 3px solid transparent;
            display: flex;
            gap: 12px;
            align-items: start;
        }

        .package-result:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .package-result.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
            border-left-color: var(--vscode-focusBorder);
        }

        .package-icon {
            width: 48px;
            height: 48px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
            overflow: hidden;
        }

        .package-icon img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .package-icon-fallback {
            background: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-button-hoverBackground));
            color: var(--vscode-button-foreground);
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            border-radius: 6px;
        }

        .package-result-info {
            flex: 1;
            min-width: 0;
        }

        .package-result-name {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .installed-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-weight: 600;
        }

        .package-result-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .package-result-downloads {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .info-panel {
            width: 500px;
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-editor-background);
            position: relative;
        }

        .info-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .info-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .info-subtitle {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }

        .info-content {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }

        .info-section {
            margin-bottom: 24px;
        }

        .info-section-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
        }

        .info-description {
            font-size: 13px;
            line-height: 1.6;
            color: var(--vscode-foreground);
        }

        .info-meta {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .meta-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            font-size: 12px;
        }

        .meta-label {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }

        .meta-value {
            color: var(--vscode-foreground);
            font-family: 'Consolas', 'Courier New', monospace;
        }

        .versions-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-editor-background);
            position: relative;
        }

        .versions-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .versions-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
        }

        .category-selector {
            margin-bottom: 12px;
        }

        .category-selector label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            display: block;
            margin-bottom: 6px;
        }

        .category-selector select {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 13px;
        }

        .category-selector select:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .versions-content {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
        }

        .versions-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .version-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            border: 1px solid transparent;
        }

        .version-item:hover {
            border-color: var(--vscode-focusBorder);
        }

        .version-item.latest {
            border-color: var(--vscode-gitDecoration-addedResourceForeground);
        }

        .version-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .version-number {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 13px;
        }

        .version-label {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .btn {
            padding: 6px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 24px;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-state-text {
            font-size: 14px;
            margin-bottom: 8px;
        }

        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 32px;
            color: var(--vscode-descriptionForeground);
        }

        .install-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            backdrop-filter: blur(2px);
        }

        .install-overlay-content {
            background-color: var(--vscode-editor-background);
            padding: 24px 32px;
            border-radius: 4px;
            text-align: center;
            border: 1px solid var(--vscode-panel-border);
        }

        .install-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid var(--vscode-panel-border);
            border-top: 4px solid var(--vscode-button-background);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .install-message {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 4px;
        }

        .install-details {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="search-panel">
            <div class="header">
                <h2>Search NuGet Packages</h2>
                <div class="search-box">
                    <input type="text" id="searchInput" placeholder="Search for packages..." onkeyup="handleSearch()">
                </div>
            </div>
            <div class="results-list" id="resultsList">
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-text">Search for NuGet packages to add</div>
                </div>
            </div>
        </div>

        <div class="info-panel" id="infoPanel">
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">Select a package to view details</div>
            </div>
        </div>

        <div class="versions-panel" id="versionsPanel">
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-text">Select a package to choose a version</div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let searchResults = [];
        let installedPackages = [];
        let allProjects = [];
        let packageUsage = {}; // Map of packageName -> array of project names that use it
        let selectedPackage = null;
        let searchTimeout = null;

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'searchResults':
                    searchResults = message.results;
                    renderSearchResults();
                    break;
                case 'installedPackages':
                    installedPackages = message.packages;
                    allProjects = message.projects || [];
                    packageUsage = message.packageUsage || {};
                    break;
                case 'packageDetails':
                    renderPackageDetails(message.packageName, message.info);
                    break;
                case 'versionsData':
                    renderVersions(message.packageName, message.versions);
                    break;
                case 'installInProgress':
                    showInstallInProgress(message.packageName, message.version);
                    break;
                case 'installComplete':
                    hideInstallInProgress();
                    break;
                case 'removeInProgress':
                    showRemoveInProgress(message.packageName);
                    break;
                case 'removeComplete':
                    hideRemoveInProgress();
                    break;
                case 'installSuccess':
                    installedPackages.push(message.packageName);
                    renderSearchResults();
                    // Refresh details panel if this package is currently selected
                    if (selectedPackage === message.packageName) {
                        selectPackage(message.packageName);
                    }
                    break;
                case 'packageRemoved':
                    const index = installedPackages.indexOf(message.packageName);
                    if (index > -1) {
                        installedPackages.splice(index, 1);
                    }
                    renderSearchResults();
                    // Refresh details panel if this package is currently selected
                    if (selectedPackage === message.packageName) {
                        selectPackage(message.packageName);
                    }
                    break;
            }
        });

        function handleSearch() {
            const query = document.getElementById('searchInput').value;
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }

            if (query.length < 2) {
                searchResults = [];
                renderSearchResults();
                return;
            }

            searchTimeout = setTimeout(() => {
                vscode.postMessage({
                    type: 'searchPackages',
                    query: query
                });
            }, 300);
        }

        function renderSearchResults() {
            const resultsList = document.getElementById('resultsList');

            if (searchResults.length === 0) {
                resultsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">No packages found</div></div>';
                return;
            }

            resultsList.innerHTML = searchResults.map((pkg, index) => {
                const isInstalled = installedPackages.includes(pkg.id);
                const iconId = 'search_icon_' + index;
                const fallback = \`<span class="package-icon-fallback">\${pkg.id.charAt(0).toUpperCase()}</span>\`;

                let iconHtml;
                if (pkg.iconUrl && pkg.iconUrl.trim() !== '') {
                    iconHtml = \`
                        <img id="\${iconId}" src="\${pkg.iconUrl}" alt="\${pkg.id}"
                             style="display: block; width: 100%; height: 100%; object-fit: contain;"
                             onerror="document.getElementById('\${iconId}').style.display='none'; document.getElementById('\${iconId}_fallback').style.display='flex';">
                        <span id="\${iconId}_fallback" class="package-icon-fallback" style="display: none;">\${pkg.id.charAt(0).toUpperCase()}</span>
                    \`;
                } else {
                    iconHtml = fallback;
                }

                return \`
                    <div class="package-result \${selectedPackage === pkg.id ? 'selected' : ''}" onclick="selectPackage('\${pkg.id}')">
                        <div class="package-icon">\${iconHtml}</div>
                        <div class="package-result-info">
                            <div class="package-result-name">
                                \${pkg.id}
                                \${isInstalled ? '<span class="installed-badge">INSTALLED</span>' : ''}
                            </div>
                            <div class="package-result-description">\${pkg.description || 'No description available'}</div>
                            <div class="package-result-downloads">↓ \${pkg.totalDownloads.toLocaleString()} downloads</div>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function selectPackage(packageId) {
            selectedPackage = packageId;
            renderSearchResults();

            const infoPanel = document.getElementById('infoPanel');
            const versionsPanel = document.getElementById('versionsPanel');

            infoPanel.innerHTML = '<div class="loading">Loading package information...</div>';
            versionsPanel.innerHTML = '<div class="loading">Loading versions...</div>';

            vscode.postMessage({
                type: 'getPackageDetails',
                packageName: packageId
            });

            vscode.postMessage({
                type: 'getVersions',
                packageName: packageId
            });
        }

        function renderPackageDetails(packageName, info) {
            const infoPanel = document.getElementById('infoPanel');
            const description = info?.description || 'No description available';
            const authors = info?.authors?.join(', ') || 'Unknown';
            const downloads = info?.downloads?.toLocaleString() || 'N/A';
            const published = info?.published ? new Date(info.published).toLocaleDateString() : 'N/A';
            const isInstalled = installedPackages.includes(packageName);

            infoPanel.innerHTML = \`
                <div class="info-header">
                    <div class="info-title">\${packageName}</div>
                    <div class="info-subtitle">Package Information</div>
                </div>
                <div class="info-content">
                    <div class="info-section">
                        <div class="info-section-title">Description</div>
                        <div class="info-description">\${description}</div>
                    </div>

                    <div class="info-section">
                        <div class="info-section-title">Metadata</div>
                        <div class="info-meta">
                            <div class="meta-item">
                                <span class="meta-label">Authors</span>
                                <span class="meta-value">\${authors}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Downloads</span>
                                <span class="meta-value">\${downloads}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Published</span>
                                <span class="meta-value">\${published}</span>
                            </div>
                        </div>
                    </div>
                    \${isInstalled ? \`
                        <div class="info-section">
                            <button class="btn remove-package-btn" data-package-name="\${packageName}" style="width: 100%;">Remove Package</button>
                        </div>
                    \` : ''}
                </div>
            \`;
        }

        function renderVersions(packageName, versions) {
            const versionsPanel = document.getElementById('versionsPanel');
            const latestVersion = versions[0];
            const stableVersions = versions.filter(v => !v.includes('-'));
            const latestStable = stableVersions[0];

            // Get categories from existing packages
            const categories = ['Test Framework', 'Database Providers', 'Utilities', 'Microsoft Extensions', 'HTTP and REST', 'Azure Services', 'Security and Authentication'];

            // Check which projects already have this package
            const isInstalled = installedPackages.includes(packageName);
            const projectsWithPackage = isInstalled ? (packageUsage[packageName] || []) : [];

            versionsPanel.innerHTML = \`
                <div class="versions-header">
                    <div class="versions-title">Select Version and Category</div>
                    <div class="category-selector">
                        <label>Category</label>
                        <select id="categorySelect">
                            \${categories.map(cat => \`<option value="\${cat}">\${cat}</option>\`).join('')}
                            <option value="">Create New Category...</option>
                        </select>
                    </div>
                    <div class="project-selector" style="margin-top: 16px;">
                        <label style="display: block; margin-bottom: 8px;">\${isInstalled ? 'Add to Additional Projects:' : 'Install in Projects:'}</label>
                        <div style="max-height: 150px; overflow-y: auto; border: 1px solid var(--vscode-input-border); padding: 8px; border-radius: 2px;">
                            \${allProjects.length > 0 ? allProjects.map((project, idx) => {
                                const hasPackage = projectsWithPackage.includes(project.name);
                                return \`
                                    <div style="margin-bottom: 4px;">
                                        <label style="display: flex; align-items: center; cursor: \${hasPackage ? 'default' : 'pointer'}; opacity: \${hasPackage ? '0.6' : '1'};">
                                            <input type="checkbox" id="project_\${idx}" value="\${project.path}" \${hasPackage ? 'checked disabled' : ''} \${!hasPackage && !isInstalled ? 'checked' : ''} style="margin-right: 8px;">
                                            <span>\${hasPackage ? '✓ ' : ''}\${project.name}\${hasPackage ? ' (installed)' : ''}</span>
                                        </label>
                                    </div>
                                \`;
                            }).join('') : '<div style="color: var(--vscode-descriptionForeground);">No projects found</div>'}
                        </div>
                        <div style="margin-top: 8px; font-size: 11px; color: var(--vscode-descriptionForeground);">
                            \${isInstalled ? 'Select additional projects to add this package to' : 'Select which projects should reference this package'}
                        </div>
                    </div>
                </div>
                <div class="versions-content">
                    <div class="versions-list">
                        \${versions.slice(0, 20).map(version => \`
                            <div class="version-item \${version === latestVersion ? 'latest' : ''}">
                                <div class="version-info">
                                    <span class="version-number">\${version}</span>
                                    \${version === latestVersion ? '<span class="version-label">Latest</span>' : ''}
                                    \${version === latestStable && version !== latestVersion ? '<span class="version-label">Latest Stable</span>' : ''}
                                </div>
                                <button class="btn" onclick="installPackage('\${packageName}', '\${version}')">\${isInstalled ? 'Add to Projects' : 'Install'}</button>
                            </div>
                        \`).join('')}
                    </div>
                </div>
            \`;
        }

        function installPackage(packageName, version) {
            const categorySelect = document.getElementById('categorySelect');
            let category = categorySelect.value;

            if (category === '') {
                category = prompt('Enter new category name:');
                if (!category) return;
            }

            // Collect selected projects (only non-disabled checkboxes that are checked)
            const selectedProjects = [];
            allProjects.forEach((project, idx) => {
                const checkbox = document.getElementById(\`project_\${idx}\`);
                if (checkbox && checkbox.checked && !checkbox.disabled) {
                    selectedProjects.push(project.path);
                }
            });

            vscode.postMessage({
                type: 'installPackage',
                packageName: packageName,
                version: version,
                category: category,
                projects: selectedProjects
            });
        }

        function removePackage(packageName) {
            vscode.postMessage({
                type: 'removePackage',
                packageName: packageName
            });
        }

        function showInstallInProgress(packageName, version) {
            const versionsPanel = document.getElementById('versionsPanel');

            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'install-overlay';
            overlay.id = 'installOverlay';
            overlay.innerHTML = \`
                <div class="install-overlay-content">
                    <div class="install-spinner"></div>
                    <div class="install-message">Installing Package</div>
                    <div class="install-details">\${packageName} → \${version}</div>
                </div>
            \`;

            versionsPanel.appendChild(overlay);
        }

        function hideInstallInProgress() {
            const overlay = document.getElementById('installOverlay');
            if (overlay) {
                overlay.remove();
            }
        }

        function showRemoveInProgress(packageName) {
            const infoPanel = document.getElementById('infoPanel');

            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'install-overlay';
            overlay.id = 'removeOverlay';
            overlay.innerHTML = \`
                <div class="install-overlay-content">
                    <div class="install-spinner"></div>
                    <div class="install-message">Removing Package</div>
                    <div class="install-details">\${packageName}</div>
                </div>
            \`;

            infoPanel.appendChild(overlay);
        }

        function hideRemoveInProgress() {
            const overlay = document.getElementById('removeOverlay');
            if (overlay) {
                overlay.remove();
            }
        }

        // Event delegation for remove package button
        document.addEventListener('click', function(event) {
            const target = event.target;
            if (target && target.classList && target.classList.contains('remove-package-btn')) {
                const packageName = target.getAttribute('data-package-name');
                if (packageName) {
                    removePackage(packageName);
                }
            }
        });
    </script>
</body>
</html>`;
    }
}
