export function getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>.NET Central Package Manager</title>
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
            position: relative;
        }

        /* Package List Sidebar */
        .sidebar {
            width: 350px;
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-sideBar-background);
        }

        .header {
            padding: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h2 {
            font-size: 16px;
            font-weight: 600;
        }

        .header-actions {
            display: flex;
            gap: 8px;
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

        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .search-box {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .search-box input {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 13px;
        }

        .search-box input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .package-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        }

        .category {
            margin-bottom: 4px;
        }

        .category-header {
            padding: 8px 16px;
            font-weight: 600;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .category-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .category-icon {
            font-size: 10px;
            transition: transform 0.2s;
        }

        .category-packages {
            display: none;
        }

        .category.expanded .category-packages {
            display: block;
        }

        .category.expanded .category-icon {
            transform: rotate(90deg);
        }

        .package-item {
            padding: 10px 16px 10px 32px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            border-left: 3px solid transparent;
        }

        .package-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .package-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
            border-left-color: var(--vscode-focusBorder);
        }

        .package-icon {
            width: 32px;
            height: 32px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
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
            border-radius: 4px;
        }

        .package-info {
            flex: 1;
            min-width: 0;
        }

        .package-name {
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .package-version {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .upgrade-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background-color: var(--vscode-gitDecoration-addedResourceForeground);
            color: var(--vscode-editor-background);
            font-weight: 600;
        }

        /* Info Pane */
        .info-pane {
            width: 400px;
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-editor-background);
            position: relative;
        }

        .info-header {
            padding: 16px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .info-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .info-subtitle {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .info-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
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

        .usage-box {
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }

        .usage-title {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-descriptionForeground);
        }

        .usage-list {
            list-style: none;
            font-size: 12px;
        }

        .usage-list li {
            padding: 4px 0;
        }

        .project-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            margin-bottom: 4px;
            background-color: var(--vscode-editor-background);
            border-radius: 3px;
        }

        .project-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .project-name {
            font-size: 13px;
            flex: 1;
        }

        .project-used {
            color: var(--vscode-foreground);
            font-weight: 500;
        }

        .project-unused {
            color: var(--vscode-descriptionForeground);
        }

        .btn-small {
            padding: 4px 10px;
            font-size: 11px;
            min-width: 60px;
        }

        .btn-add {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-add:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn-remove {
            background-color: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-input-border);
        }

        .btn-remove:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-descriptionForeground);
        }

        /* Versions Panel */
        .versions-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-editor-background);
            position: relative;
        }

        .upgrade-overlay {
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

        .upgrade-overlay-content {
            background-color: var(--vscode-editor-background);
            padding: 24px 32px;
            border-radius: 4px;
            text-align: center;
            border: 1px solid var(--vscode-panel-border);
        }

        .upgrade-spinner {
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

        .upgrade-message {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 4px;
        }

        .upgrade-details {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .versions-header {
            padding: 16px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .versions-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .current-version {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }

        .version-badge {
            font-size: 16px;
            font-weight: 600;
            font-family: 'Consolas', 'Courier New', monospace;
        }

        .versions-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
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

        .upgrade-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }

        .btn-small {
            padding: 4px 12px;
            font-size: 12px;
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

        .remove-btn {
            margin-top: 16px;
        }

        /* Analysis badges */
        .vulnerability-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: 600;
        }
        .vulnerability-badge.critical, .vulnerability-badge.high {
            background-color: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
        }
        .vulnerability-badge.moderate {
            background-color: var(--vscode-editorWarning-foreground);
            color: var(--vscode-editor-background);
        }
        .vulnerability-badge.low {
            background-color: var(--vscode-descriptionForeground);
            color: var(--vscode-editor-background);
        }
        .conflict-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background-color: var(--vscode-editorWarning-foreground);
            color: var(--vscode-editor-background);
            font-weight: 600;
        }
        .version-conflict-warning {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background-color: var(--vscode-editorWarning-foreground);
            color: var(--vscode-editor-background);
            font-weight: 600;
            cursor: help;
        }
        .version-compatible {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background-color: var(--vscode-gitDecoration-addedResourceForeground, #4ec94e);
            color: var(--vscode-editor-background);
            font-weight: 600;
        }
        .version-vulnerable {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background-color: var(--vscode-editorError-foreground, #f44747);
            color: var(--vscode-editor-background);
            font-weight: 600;
            cursor: help;
        }
        .constraint-banner {
            margin-top: 8px;
            font-size: 11px;
            color: var(--vscode-editorWarning-foreground);
            padding: 8px 12px;
            background: rgba(255,165,0,0.08);
            border-radius: 4px;
            border-left: 3px solid var(--vscode-editorWarning-foreground);
        }
        /* Analysis overlay */
        .analysis-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.4);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 100;
        }
        .analysis-overlay.visible {
            display: flex;
        }
        .analysis-overlay-content {
            background-color: var(--vscode-editor-background);
            padding: 24px 32px;
            border-radius: 4px;
            text-align: center;
            border: 1px solid var(--vscode-panel-border);
        }
        .analysis-overlay-content .upgrade-spinner {
            margin: 0 auto 12px;
        }
        .analysis-overlay-message {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .analysis-overlay-detail {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        /* Analysis status bar */
        .analysis-status {
            padding: 8px 16px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            flex-shrink: 0;
        }
        .analysis-status-text {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .analysis-issue-count {
            color: var(--vscode-editorWarning-foreground);
            font-weight: 600;
        }
        .btn-analysis {
            padding: 3px 10px;
            font-size: 11px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .btn-analysis:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        /* Analysis info sections */
        .vuln-item {
            padding: 10px 12px;
            margin-bottom: 6px;
            border-radius: 4px;
            border-left: 3px solid;
        }
        .vuln-item.critical, .vuln-item.high {
            background-color: rgba(255, 0, 0, 0.08);
            border-left-color: var(--vscode-errorForeground);
        }
        .vuln-item.moderate {
            background-color: rgba(255, 165, 0, 0.08);
            border-left-color: var(--vscode-editorWarning-foreground);
        }
        .vuln-item.low {
            background-color: rgba(128, 128, 128, 0.08);
            border-left-color: var(--vscode-descriptionForeground);
        }
        .vuln-severity {
            font-weight: 600;
            font-size: 12px;
            margin-bottom: 4px;
        }
        .vuln-advisory {
            font-size: 11px;
        }
        .vuln-advisory a {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: none;
        }
        .vuln-advisory a:hover {
            text-decoration: underline;
        }
        .conflict-item {
            padding: 10px 12px;
            margin-bottom: 6px;
            background-color: rgba(255, 165, 0, 0.08);
            border-radius: 4px;
            border-left: 3px solid var(--vscode-editorWarning-foreground);
            font-size: 12px;
            line-height: 1.6;
        }
        .conflict-versions {
            font-family: 'Consolas', 'Courier New', monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="analysis-overlay" id="analysisOverlay">
            <div class="analysis-overlay-content">
                <div class="upgrade-spinner"></div>
                <div class="analysis-overlay-message">Analyzing Dependencies</div>
                <div class="analysis-overlay-detail">Checking for transitive conflicts and vulnerabilities...</div>
            </div>
        </div>

        <!-- Package List Sidebar -->
        <div class="sidebar">
            <div class="header">
                <h2>Packages</h2>
                <div class="header-actions">
                    <button class="btn btn-secondary" onclick="refresh()">↻</button>
                    <button class="btn" onclick="addPackage()">+ Add</button>
                </div>
            </div>
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="Search packages..." onkeyup="filterPackages()">
            </div>
            <div class="package-list" id="packageList">
                <div class="loading">Loading packages...</div>
            </div>
            <div class="analysis-status" id="analysisStatus">
                <span class="analysis-status-text">Analysis: not run</span>
                <button class="btn-analysis" onclick="runAnalysis()">Analyze</button>
            </div>
        </div>

        <!-- Package Info Pane -->
        <div class="info-pane" id="infoPane">
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">Select a package to view details</div>
            </div>
        </div>

        <!-- Versions Panel -->
        <div class="versions-panel" id="versionsPane">
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-text">Select a package to view available versions</div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let packagesData = [];
        let itemGroupsData = [];
        let allProjects = [];
        let selectedPackage = null;
        let currentPackageInfo = null;
        let analysisResult = null;
        let currentAnalysisData = null;

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updatePackages':
                    const oldPackagesData = packagesData;
                    packagesData = message.packages;
                    itemGroupsData = message.itemGroups;

                    // Deduplicate projects by path (defensive programming against race conditions)
                    const projectsMap = new Map();
                    (message.allProjects || []).forEach(project => {
                        projectsMap.set(project.path, project);
                    });
                    allProjects = Array.from(projectsMap.values());

                    // Only re-render the package list if the packages actually changed (not just project usage)
                    const packagesChanged = !oldPackagesData || oldPackagesData.length !== packagesData.length ||
                        oldPackagesData.some((oldPkg, idx) =>
                            !packagesData[idx] || oldPkg.name !== packagesData[idx].name || oldPkg.version !== packagesData[idx].version ||
                            oldPkg.hasConflicts !== packagesData[idx].hasConflicts ||
                            oldPkg.hasVulnerabilities !== packagesData[idx].hasVulnerabilities ||
                            oldPkg.hasUpdate !== packagesData[idx].hasUpdate ||
                            oldPkg.maxVulnerabilitySeverity !== packagesData[idx].maxVulnerabilitySeverity
                        );

                    analysisResult = message.analysisResult || null;

                    if (packagesChanged) {
                        renderPackageList();
                    }

                    updateAnalysisStatus();

                    // Refresh package info if a package is currently selected
                    if (selectedPackage && currentPackageInfo) {
                        // Re-render with existing package info and updated project data
                        renderPackageInfo(selectedPackage, currentPackageInfo);
                    }
                    break;
                case 'packageInfo':
                    currentPackageInfo = message.info;
                    renderPackageInfo(message.packageName, message.info);
                    break;
                case 'versionsData':
                    renderVersions(message);
                    break;
                case 'upgradeInProgress':
                    showUpgradeInProgress(message.packageName, message.version, message.action);
                    break;
                case 'upgradeComplete':
                    hideUpgradeInProgress();
                    break;
                case 'projectOperationInProgress':
                    showProjectOperationInProgress(message.packageName, message.projectName, message.action);
                    break;
                case 'projectOperationComplete':
                    hideProjectOperationInProgress();
                    break;
                case 'packageAnalysis':
                    currentAnalysisData = {
                        conflicts: message.conflicts || [],
                        vulnerabilities: message.vulnerabilities || []
                    };
                    if (selectedPackage && currentPackageInfo) {
                        renderPackageInfo(selectedPackage, currentPackageInfo);
                    }
                    break;
                case 'analysisStatusChanged': {
                    const overlay = document.getElementById('analysisOverlay');
                    if (overlay) {
                        if (message.isRunning) {
                            overlay.classList.add('visible');
                        } else {
                            overlay.classList.remove('visible');
                        }
                    }
                    // Update the status bar to reflect running state
                    if (analysisResult) {
                        analysisResult.isRunning = message.isRunning;
                    }
                    updateAnalysisStatus();
                    break;
                }
                case 'packageRemoved':
                    // Clear the info and versions panes
                    selectedPackage = null;
                    document.getElementById('infoPane').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">Select a package to view details</div></div>';
                    document.getElementById('versionsPane').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Package versions will appear here</div></div>';
                    break;
            }
        });

        function getPackageIcon(packageData) {
            const pkg = packagesData.find(p => p.name === packageData.name);
            const fallback = \`<span class="package-icon-fallback">\${packageData.name.charAt(0).toUpperCase()}</span>\`;

            if (pkg && pkg.iconUrl && pkg.iconUrl.trim() !== '') {
                const iconId = 'icon_' + packageData.name.replace(/[^a-zA-Z0-9]/g, '_');
                return \`
                    <img id="\${iconId}" src="\${pkg.iconUrl}" alt="\${packageData.name}"
                         style="display: block; width: 100%; height: 100%; object-fit: contain;"
                         onerror="document.getElementById('\${iconId}').style.display='none'; document.getElementById('\${iconId}_fallback').style.display='flex';">
                    <span id="\${iconId}_fallback" class="package-icon-fallback" style="display: none;">\${packageData.name.charAt(0).toUpperCase()}</span>
                \`;
            }
            return fallback;
        }

        function renderPackageList() {
            const listElement = document.getElementById('packageList');
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();

            if (itemGroupsData.length === 0) {
                listElement.innerHTML = '<div class="empty-state"><div class="empty-state-text">No packages found</div></div>';
                return;
            }

            let html = '';
            itemGroupsData.forEach(group => {
                const label = group.label || 'Uncategorized';
                const filteredPackages = group.packages.filter(pkg =>
                    pkg.name.toLowerCase().includes(searchTerm)
                );

                if (filteredPackages.length > 0) {
                    html += \`
                        <div class="category expanded">
                            <div class="category-header" onclick="toggleCategory(this)">
                                <span class="category-icon">▸</span>
                                <span>\${label} (\${filteredPackages.length})</span>
                            </div>
                            <div class="category-packages">
                                \${filteredPackages.map(pkg => {
                                    const pkgData = packagesData.find(p => p.name === pkg.name);
                                    const hasUpdate = pkgData && pkgData.hasUpdate;
                                    return \`
                                    <div class="package-item \${selectedPackage === pkg.name ? 'selected' : ''}"
                                         onclick="selectPackage('\${pkg.name}')">
                                        <div class="package-icon">\${getPackageIcon(pkg)}</div>
                                        <div class="package-info">
                                            <div class="package-name">\${pkg.name}</div>
                                            <div class="package-version">
                                                v\${pkg.version}
                                                \${hasUpdate ? '<span class="upgrade-badge">UPGRADE</span>' : ''}
                                                \${pkgData && pkgData.hasVulnerabilities ? \`<span class="vulnerability-badge \${(pkgData.maxVulnerabilitySeverity || '').toLowerCase()}">\${pkgData.maxVulnerabilitySeverity || 'VULN'}</span>\` : ''}
                                                \${pkgData && pkgData.hasConflicts ? '<span class="conflict-badge">CONFLICT</span>' : ''}
                                            </div>
                                        </div>
                                    </div>
                                \`;
                                }).join('')}
                            </div>
                        </div>
                    \`;
                }
            });

            listElement.innerHTML = html;
        }

        function toggleCategory(element) {
            element.parentElement.classList.toggle('expanded');
        }

        function selectPackage(packageName) {
            selectedPackage = packageName;
            currentAnalysisData = null;
            renderPackageList();

            const infoPane = document.getElementById('infoPane');
            const versionsPane = document.getElementById('versionsPane');

            infoPane.innerHTML = '<div class="loading">Loading package information...</div>';
            versionsPane.innerHTML = '<div class="loading">Loading versions...</div>';

            vscode.postMessage({
                type: 'getPackageInfo',
                packageName: packageName
            });

            vscode.postMessage({
                type: 'getVersions',
                packageName: packageName
            });

            vscode.postMessage({
                type: 'getPackageAnalysis',
                packageName: packageName
            });
        }

        function renderPackageInfo(packageName, info) {
            const pkg = packagesData.find(p => p.name === packageName);
            if (!pkg) return;

            const infoPane = document.getElementById('infoPane');

            const description = info?.description || 'No description available';
            const authors = info?.authors?.join(', ') || 'Unknown';
            const downloads = info?.downloads?.toLocaleString() || 'N/A';
            const published = info?.published ? new Date(info.published).toLocaleDateString() : 'N/A';

            infoPane.innerHTML = \`
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

                    \${currentAnalysisData && currentAnalysisData.vulnerabilities.length > 0 ? \`
                        <div class="info-section">
                            <div class="info-section-title">Security Vulnerabilities (\${currentAnalysisData.vulnerabilities.length})</div>
                            \${currentAnalysisData.vulnerabilities.map(v =>
                                v.vulnerabilities.map(vv => \`
                                    <div class="vuln-item \${vv.severity.toLowerCase()}">
                                        <div class="vuln-severity">\${vv.severity}</div>
                                        <div class="vuln-advisory">
                                            \${v.resolvedVersion}\${v.isTransitive ? ' (transitive)' : ''}
                                            \${vv.advisoryUrl ? \` — <a href="#" onclick="openExternal('\${vv.advisoryUrl}'); return false;">View Advisory</a>\` : ''}
                                        </div>
                                    </div>
                                \`).join('')
                            ).join('')}
                        </div>
                    \` : ''}

                    \${currentAnalysisData && currentAnalysisData.conflicts.length > 0 ? \`
                        <div class="info-section">
                            <div class="info-section-title">Transitive Conflicts (\${currentAnalysisData.conflicts.length})</div>
                            \${currentAnalysisData.conflicts.map(c => \`
                                <div class="conflict-item">
                                    Central version <span class="conflict-versions">\${c.centralVersion}</span>
                                    but <strong>\${c.transitiveParents.length > 0 ? c.transitiveParents.join(', ') : 'other packages'}</strong>
                                    requires <span class="conflict-versions">\${c.transitiveVersion}</span>
                                    <br>Projects: \${c.projects.join(', ')}
                                </div>
                            \`).join('')}
                        </div>
                    \` : ''}

                    \${allProjects && allProjects.length > 0 ? \`
                        <div class="info-section">
                            <div class="info-section-title">Projects (\${pkg.usedIn ? pkg.usedIn.length : 0} / \${allProjects.length})</div>
                            <div class="usage-box">
                                <ul class="usage-list">
                                    \${allProjects.map(project => {
                                        const isUsed = pkg.usedIn && pkg.usedIn.includes(project.name);
                                        return \`
                                            <li class="project-item">
                                                <span class="project-name \${isUsed ? 'project-used' : 'project-unused'}">
                                                    \${isUsed ? '✓' : '○'} \${project.name}
                                                </span>
                                                <button
                                                    class="btn btn-small \${isUsed ? 'btn-remove' : 'btn-add'} project-toggle-btn"
                                                    data-package-name="\${packageName}"
                                                    data-project-path="\${project.path}"
                                                    data-action="\${isUsed ? 'remove' : 'add'}">
                                                    \${isUsed ? 'Remove' : 'Add'}
                                                </button>
                                            </li>
                                        \`;
                                    }).join('')}
                                </ul>
                            </div>
                        </div>
                    \` : ''}

                    <div class="info-section">
                        <button class="btn remove-btn remove-package-btn" data-package-name="\${packageName}" style="width: 100%;">Remove Package</button>
                    </div>
                </div>
            \`;
        }

        function compareVersions(v1, v2) {
            const parts1 = v1.split(/[.-]/).map(p => parseInt(p) || 0);
            const parts2 = v2.split(/[.-]/).map(p => parseInt(p) || 0);
            const maxLength = Math.max(parts1.length, parts2.length);

            for (let i = 0; i < maxLength; i++) {
                const p1 = parts1[i] || 0;
                const p2 = parts2[i] || 0;
                if (p1 < p2) return -1;
                if (p1 > p2) return 1;
            }
            return 0;
        }

        function versionSatisfiesConstraint(version, tc) {
            if (!tc) return true;
            if (tc.isExact) {
                return version === tc.requiredVersion;
            }
            // Minimum version: version must be >= requiredVersion
            return compareVersions(version, tc.requiredVersion) >= 0;
        }

        function renderVersions(data) {
            const versionsPane = document.getElementById('versionsPane');
            const currentVersion = data.currentVersion;
            const stableVersions = data.versions.filter(v => !v.includes('-'));
            const latestStable = stableVersions[0];
            const tc = data.transitiveConstraint;
            const constraintLabel = tc ? (tc.isExact ? \`= \${tc.requiredVersion}\` : \`>= \${tc.requiredVersion}\`) : '';
            const vulns = data.versionVulnerabilities || {};

            versionsPane.innerHTML = \`
                <div class="versions-header">
                    <div class="versions-title">Current Version</div>
                    <div class="current-version">
                        <div class="version-badge">\${currentVersion}</div>
                        \${data.isOutdated ? '<span class="upgrade-badge">Upgrade Available</span>' : '<span class="version-label">Up to date</span>'}
                    </div>
                    \${tc ? \`
                        <div class="constraint-banner">
                            Transitive dependency constraint: <strong>\${tc.requiredBy.join(', ')}</strong>
                            requires version <strong>\${constraintLabel}</strong>
                        </div>
                    \` : ''}
                </div>
                <div class="versions-content">
                    <div class="versions-list">
                        \${data.versions.slice(0, 20).map(version => {
                            const isDowngrade = compareVersions(version, currentVersion) < 0;
                            const buttonText = isDowngrade ? 'Downgrade' : 'Upgrade';
                            let constraintHtml = '';
                            if (tc) {
                                if (versionSatisfiesConstraint(version, tc)) {
                                    constraintHtml = '<span class="version-compatible" title="Satisfies transitive requirement">Compatible</span>';
                                } else {
                                    constraintHtml = \`<span class="version-conflict-warning" title="\${tc.requiredBy.join(', ')} requires \${constraintLabel}">Conflict Risk</span>\`;
                                }
                            }
                            const vulnInfo = vulns[version];
                            const vulnHtml = vulnInfo
                                ? \`<span class="version-vulnerable" title="\${vulnInfo.count} known \${vulnInfo.count === 1 ? 'vulnerability' : 'vulnerabilities'}">\${vulnInfo.severity}</span>\`
                                : '';
                            return \`
                            <div class="version-item \${version === data.latestVersion ? 'latest' : ''}">
                                <div class="version-info">
                                    <span class="version-number">\${version}</span>
                                    \${version === currentVersion ? '<span class="version-label">Current</span>' : ''}
                                    \${version === data.latestVersion ? '<span class="version-label">Latest</span>' : ''}
                                    \${version === latestStable && version !== data.latestVersion ? '<span class="version-label">Latest Stable</span>' : ''}
                                    \${constraintHtml}
                                    \${vulnHtml}
                                </div>
                                <div>
                                    \${version !== currentVersion ?
                                        \`<button class="btn btn-small" onclick="updatePackage('\${data.packageName}', '\${version}')">\${buttonText}</button>\` :
                                        ''
                                    }
                                </div>
                            </div>
                        \`;
                        }).join('')}
                    </div>
                </div>
            \`;
        }

        function updatePackage(packageName, version) {
            vscode.postMessage({
                type: 'updatePackage',
                packageName: packageName,
                version: version
            });
        }

        function removePackage(packageName) {
            vscode.postMessage({
                type: 'removePackage',
                packageName: packageName
            });
        }

        function addPackageToProject(packageName, projectPath) {
            vscode.postMessage({
                type: 'addPackageToProject',
                packageName: packageName,
                projectPath: projectPath
            });
        }

        function removePackageFromProject(packageName, projectPath) {
            vscode.postMessage({
                type: 'removePackageFromProject',
                packageName: packageName,
                projectPath: projectPath
            });
        }

        function showUpgradeInProgress(packageName, version, action) {
            const versionsPanel = document.getElementById('versionsPane');
            const actionText = action === 'downgrade' ? 'Downgrading' : 'Upgrading';

            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'upgrade-overlay';
            overlay.id = 'upgradeOverlay';
            overlay.innerHTML = \`
                <div class="upgrade-overlay-content">
                    <div class="upgrade-spinner"></div>
                    <div class="upgrade-message">\${actionText} Package</div>
                    <div class="upgrade-details">\${packageName} → \${version}</div>
                </div>
            \`;

            versionsPanel.appendChild(overlay);
        }

        function hideUpgradeInProgress() {
            const overlay = document.getElementById('upgradeOverlay');
            if (overlay) {
                overlay.remove();
            }
        }

        function showProjectOperationInProgress(packageName, projectName, action) {
            const infoPane = document.getElementById('infoPane');
            const actionText = action === 'add' ? 'Adding' : 'Removing';
            const preposition = action === 'add' ? 'to' : 'from';

            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'upgrade-overlay';
            overlay.id = 'projectOperationOverlay';
            overlay.innerHTML = \`
                <div class="upgrade-overlay-content">
                    <div class="upgrade-spinner"></div>
                    <div class="upgrade-message">\${actionText} Package</div>
                    <div class="upgrade-details">\${packageName} \${preposition} \${projectName}</div>
                </div>
            \`;

            infoPane.appendChild(overlay);
        }

        function hideProjectOperationInProgress() {
            const overlay = document.getElementById('projectOperationOverlay');
            if (overlay) {
                overlay.remove();
            }
        }

        function addPackage() {
            vscode.postMessage({ type: 'addPackage' });
        }

        // Event delegation for project toggle buttons and remove package button
        document.addEventListener('click', function(event) {
            const target = event.target;

            // Handle project toggle buttons
            if (target && target.classList && target.classList.contains('project-toggle-btn')) {
                const packageName = target.getAttribute('data-package-name');
                const projectPath = target.getAttribute('data-project-path');
                const action = target.getAttribute('data-action');

                if (action === 'add') {
                    addPackageToProject(packageName, projectPath);
                } else if (action === 'remove') {
                    removePackageFromProject(packageName, projectPath);
                }
            }

            // Handle remove package button
            if (target && target.classList && target.classList.contains('remove-package-btn')) {
                const packageName = target.getAttribute('data-package-name');
                if (packageName) {
                    removePackage(packageName);
                }
            }
        });

        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }

        function filterPackages() {
            renderPackageList();
        }

        function updateAnalysisStatus() {
            const el = document.getElementById('analysisStatus');
            if (!el) return;

            if (!analysisResult) {
                el.innerHTML = \`
                    <span class="analysis-status-text">Analysis: not run</span>
                    <button class="btn-analysis" onclick="runAnalysis()">Analyze</button>
                \`;
                return;
            }

            if (analysisResult.isRunning) {
                el.innerHTML = \`
                    <span class="analysis-status-text">Analyzing...</span>
                \`;
                return;
            }

            if (analysisResult.error) {
                el.innerHTML = \`
                    <span class="analysis-status-text" title="\${analysisResult.error}">Analysis: error</span>
                    <button class="btn-analysis" onclick="runAnalysis()">Retry</button>
                \`;
                return;
            }

            const totalIssues = (analysisResult.transitiveConflicts?.length || 0) + (analysisResult.vulnerablePackages?.length || 0);
            if (totalIssues > 0) {
                el.innerHTML = \`
                    <span class="analysis-status-text"><span class="analysis-issue-count">\${totalIssues} issue\${totalIssues !== 1 ? 's' : ''}</span> found</span>
                    <button class="btn-analysis" onclick="runAnalysis()">Re-analyze</button>
                \`;
            } else {
                el.innerHTML = \`
                    <span class="analysis-status-text">No issues found</span>
                    <button class="btn-analysis" onclick="runAnalysis()">Re-analyze</button>
                \`;
            }
        }

        function runAnalysis() {
            vscode.postMessage({ type: 'runAnalysis' });
        }

        function openExternal(url) {
            vscode.postMessage({ type: 'openExternal', url: url });
        }
    </script>
</body>
</html>`;
}
