import * as vscode from 'vscode';
import { CpmManager } from '../cpmManager';
import { NuGetService } from '../nugetService';
import { Package } from '../xmlService';
import { PackageAnalysisService } from '../packageAnalysisService';
import { getHtmlForWebview } from './packageManagerPanelHtml';
import { compareVersions } from '../versionUtils';

export class PackageManagerPanel {
    public static currentPanel: PackageManagerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _selectedPackage: string | null = null;
    // Cache for NuGet API results keyed by "name@version"
    private _packageInfoCache: Map<string, { iconUrl: string; hasUpdate: boolean; latestVersion: string | null }> = new Map();

    private constructor(
        panel: vscode.WebviewPanel,
        private cpmManager: CpmManager,
        private nugetService: NuGetService,
        private extensionUri: vscode.Uri,
        private analysisService?: PackageAnalysisService
    ) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        this._setWebviewMessageListener(this._panel.webview);

        // Listen to CPM manager changes
        this._disposables.push(this.cpmManager.onDidChange(() => {
            this._updateWebview();
        }));

        // Listen to analysis changes
        if (this.analysisService) {
            this._disposables.push(this.analysisService.onDidChangeAnalysis(() => {
                // Send dedicated overlay message — decoupled from _updateWebview()
                // so that unrelated events (package upgrades) don't show the overlay
                const result = this.analysisService!.getAnalysisResult();
                this._panel.webview.postMessage({
                    type: 'analysisStatusChanged',
                    isRunning: result.isRunning
                });
                this._updateWebview();
                this._refreshSelectedPackage();
            }));
        }

        // Send initial data
        this._updateWebview();

        // If analysis is already running (started before panel was created),
        // send the overlay state so the webview shows it
        if (this.analysisService) {
            const result = this.analysisService.getAnalysisResult();
            if (result.isRunning) {
                this._panel.webview.postMessage({
                    type: 'analysisStatusChanged',
                    isRunning: true
                });
            }
        }
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        cpmManager: CpmManager,
        nugetService: NuGetService,
        analysisService?: PackageAnalysisService
    ) {
        const column = vscode.ViewColumn.One;

        if (PackageManagerPanel.currentPanel) {
            PackageManagerPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dotnetCpmManager',
            '.NET Central Package Manager',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out')]
            }
        );

        PackageManagerPanel.currentPanel = new PackageManagerPanel(
            panel,
            cpmManager,
            nugetService,
            extensionUri,
            analysisService
        );
    }

    private getMaxSeverity(packageName: string): string {
        if (!this.analysisService) {
            return '';
        }
        const vulns = this.analysisService.getVulnerabilitiesForPackage(packageName);
        const severities = vulns.flatMap(v => v.vulnerabilities.map(vv => vv.severity.toLowerCase()));
        if (severities.includes('critical')) { return 'Critical'; }
        if (severities.includes('high')) { return 'High'; }
        if (severities.includes('moderate')) { return 'Moderate'; }
        if (severities.includes('low')) { return 'Low'; }
        return '';
    }

    private async _updateWebview() {
        const itemGroups = this.cpmManager.getItemGroups();
        const packages = this.cpmManager.getAllPackages();
        const allProjects = this.cpmManager.getAllProjects();

        // Only fetch NuGet API data for packages not already cached at this version
        const uncachedPackages = packages.filter(
            pkg => !this._packageInfoCache.has(`${pkg.name}@${pkg.version}`)
        );

        if (uncachedPackages.length > 0) {
            await Promise.all(
                uncachedPackages.map(async pkg => {
                    const info = await this.nugetService.getPackageInfo(pkg.name, pkg.version);
                    const updateInfo = await this.nugetService.isPackageOutdated(pkg.name, pkg.version);
                    this._packageInfoCache.set(`${pkg.name}@${pkg.version}`, {
                        iconUrl: info?.iconUrl || '',
                        hasUpdate: updateInfo.isOutdated,
                        latestVersion: updateInfo.latestVersion
                    });
                })
            );
        }

        // Build package data using cache for NuGet info + fresh analysis/usage data
        const packagesWithInfo = packages.map(pkg => {
            const cached = this._packageInfoCache.get(`${pkg.name}@${pkg.version}`)!;
            const conflicts = this.analysisService?.getConflictsForPackage(pkg.name) || [];
            const vulns = this.analysisService?.getVulnerabilitiesForPackage(pkg.name) || [];

            return {
                name: pkg.name,
                version: pkg.version,
                label: pkg.label,
                usedIn: this.cpmManager.getPackageUsage(pkg.name),
                iconUrl: cached.iconUrl,
                hasUpdate: cached.hasUpdate,
                latestVersion: cached.latestVersion,
                hasConflicts: conflicts.length > 0,
                conflictCount: conflicts.length,
                hasVulnerabilities: vulns.length > 0,
                vulnerabilityCount: vulns.length,
                maxVulnerabilitySeverity: this.getMaxSeverity(pkg.name)
            };
        });

        const analysisResult = this.analysisService?.getAnalysisResult();

        this._panel.webview.postMessage({
            type: 'updatePackages',
            itemGroups: itemGroups,
            packages: packagesWithInfo,
            allProjects: allProjects.map(p => ({ name: p.name, path: p.path })),
            // Always send isRunning:false here. The actual running state is
            // communicated via the dedicated 'analysisStatusChanged' message
            // from onDidChangeAnalysis. This prevents unrelated events (like
            // package upgrades) from showing the analysis overlay.
            analysisResult: analysisResult ? {
                transitiveConflicts: analysisResult.transitiveConflicts,
                vulnerablePackages: analysisResult.vulnerablePackages,
                lastUpdated: analysisResult.lastUpdated?.toISOString() || null,
                isRunning: false,
                error: analysisResult.error
            } : null
        });
    }

    private async _refreshSelectedPackage() {
        if (!this._selectedPackage) {
            return;
        }
        this._handleGetPackageAnalysis(this._selectedPackage);
        await this._handleGetVersions(this._selectedPackage);
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'getPackageInfo':
                        this._selectedPackage = message.packageName;
                        await this._handleGetPackageInfo(message.packageName);
                        break;
                    case 'getVersions':
                        await this._handleGetVersions(message.packageName);
                        break;
                    case 'updatePackage':
                        await this._handleUpdatePackage(message.packageName, message.version);
                        break;
                    case 'removePackage':
                        await this._handleRemovePackage(message.packageName);
                        break;
                    case 'addPackage':
                        await this._handleAddPackage();
                        break;
                    case 'searchPackages':
                        await this._handleSearchPackages(message.query);
                        break;
                    case 'refresh':
                        this._packageInfoCache.clear();
                        await this.cpmManager.refresh();
                        break;
                    case 'addPackageToProject':
                        await this._handleAddPackageToProject(message.packageName, message.projectPath);
                        break;
                    case 'removePackageFromProject':
                        await this._handleRemovePackageFromProject(message.packageName, message.projectPath);
                        break;
                    case 'runAnalysis':
                        if (this.analysisService) {
                            await this.analysisService.runFullAnalysis(true);
                        }
                        break;
                    case 'getPackageAnalysis':
                        this._handleGetPackageAnalysis(message.packageName);
                        break;
                    case 'openExternal':
                        if (message.url) {
                            vscode.env.openExternal(vscode.Uri.parse(message.url));
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleGetPackageInfo(packageName: string) {
        try {
            const pkg = this.cpmManager.getAllPackages().find(p => p.name === packageName);
            if (!pkg) {
                return;
            }

            const packageInfo = await this.nugetService.getPackageInfo(packageName, pkg.version);

            this._panel.webview.postMessage({
                type: 'packageInfo',
                packageName: packageName,
                info: packageInfo
            });
        } catch (error) {
            console.error(`Failed to fetch package info for ${packageName}:`, error);
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

            const pkg = this.cpmManager.getAllPackages().find(p => p.name === packageName);
            const currentVersion = pkg?.version || '';

            const { isOutdated, latestVersion } = await this.nugetService.isPackageOutdated(
                packageName,
                currentVersion
            );

            const constraint = this.analysisService?.getConstraintsForPackage(packageName);
            const transitiveConstraint = constraint ? {
                requiredVersion: constraint.requiredVersion,
                versionRange: constraint.versionRange,
                isExact: constraint.isExact,
                requiredBy: constraint.requiredBy
            } : null;

            // Fetch per-version vulnerability data from NuGet registration endpoint
            const reversedVersions = versions.reverse();
            const allVulns = await this.nugetService.getVersionVulnerabilities(packageName);
            const versionVulnerabilities: Record<string, { severity: string; count: number }> = {};
            for (const version of reversedVersions.slice(0, 20)) {
                const vulns = allVulns[version.toLowerCase()];
                if (vulns && vulns.length > 0) {
                    const maxSeverity = this.getMaxVulnSeverity(vulns);
                    versionVulnerabilities[version] = { severity: maxSeverity, count: vulns.length };
                }
            }

            this._panel.webview.postMessage({
                type: 'versionsData',
                packageName: packageName,
                currentVersion: currentVersion,
                versions: reversedVersions,
                latestVersion: latestVersion,
                isOutdated: isOutdated,
                transitiveConstraint: transitiveConstraint,
                versionVulnerabilities: versionVulnerabilities
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch versions for ${packageName}`);
        }
    }

    private async _handleUpdatePackage(packageName: string, version: string) {
        // Get current version to determine if it's an upgrade or downgrade
        const pkg = this.cpmManager.getAllPackages().find(p => p.name === packageName);
        const currentVersion = pkg?.version || '';
        const isDowngrade = compareVersions(currentVersion, version) > 0;
        const action = isDowngrade ? 'downgrade' : 'upgrade';

        // Notify webview that upgrade/downgrade is in progress
        this._panel.webview.postMessage({
            type: 'upgradeInProgress',
            packageName: packageName,
            version: version,
            action: action
        });

        const success = await this.cpmManager.updatePackageVersion(packageName, version);

        if (success) {
            // Small delay to ensure webview has processed the update from onDidChange event
            await new Promise(resolve => setTimeout(resolve, 100));

            // Refresh the selected package info and versions with updated data
            await this._handleGetPackageInfo(packageName);
            await this._handleGetVersions(packageName);
        }
        // Note: _updateWebview() is called automatically by onDidChange event after refresh()

        // Notify webview that upgrade/downgrade is complete
        this._panel.webview.postMessage({
            type: 'upgradeComplete',
            packageName: packageName,
            success: success
        });
    }

    private getMaxVulnSeverity(vulns: Array<{ severity: string }>): string {
        const severities = vulns.map(v => v.severity.toLowerCase());
        if (severities.includes('critical')) { return 'Critical'; }
        if (severities.includes('high')) { return 'High'; }
        if (severities.includes('moderate')) { return 'Moderate'; }
        if (severities.includes('low')) { return 'Low'; }
        return 'Unknown';
    }

    private async _handleRemovePackage(packageName: string) {
        try {
            // cpmManager.removePackage handles confirmation dialog
            const success = await this.cpmManager.removePackage(packageName);
            if (success) {
                this._selectedPackage = null;
                // Clear the info and versions panes after removal
                this._panel.webview.postMessage({
                    type: 'packageRemoved'
                });
            } else {
                // User cancelled or removal failed - no message needed as cpmManager handles it
            }
            // Note: _updateWebview() is called automatically by onDidChange event after refresh()
        } catch (error) {
            console.error('Error removing package:', error);
            vscode.window.showErrorMessage(`Error removing package: ${error}`);
        }
    }

    private async _handleAddPackage() {
        // Import and call the add package panel
        const { AddPackagePanel } = await import('../commands/addPackagePanel');
        AddPackagePanel.createOrShow(this.extensionUri, this.cpmManager, this.nugetService);
    }

    private async _handleSearchPackages(query: string) {
        try {
            const results = await this.nugetService.searchPackages(query, false, 20);
            this._panel.webview.postMessage({
                type: 'searchResults',
                results: results
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to search packages: ${error}`);
        }
    }

    private _handleGetPackageAnalysis(packageName: string) {
        if (!this.analysisService) {
            return;
        }

        const conflicts = this.analysisService.getConflictsForPackage(packageName);
        const vulnerabilities = this.analysisService.getVulnerabilitiesForPackage(packageName);

        this._panel.webview.postMessage({
            type: 'packageAnalysis',
            packageName: packageName,
            conflicts: conflicts,
            vulnerabilities: vulnerabilities
        });
    }

    private async _handleAddPackageToProject(packageName: string, projectPath: string) {
        try {
            // Get project name for display
            const projectName = projectPath.split(/[\\/]/).pop()?.replace('.csproj', '') || 'project';

            // Notify webview that add is in progress
            this._panel.webview.postMessage({
                type: 'projectOperationInProgress',
                packageName: packageName,
                projectName: projectName,
                action: 'add'
            });

            const success = await this.cpmManager.addPackageToProject(packageName, projectPath);

            // Notify webview that operation is complete
            this._panel.webview.postMessage({
                type: 'projectOperationComplete',
                success: success
            });

            if (!success) {
                vscode.window.showWarningMessage(`Failed to add ${packageName} to project`);
            }
            // Note: _updateWebview() is called automatically by onDidChange event after refresh()
        } catch (error) {
            console.error('Error adding package to project:', error);
            this._panel.webview.postMessage({
                type: 'projectOperationComplete',
                success: false
            });
            vscode.window.showErrorMessage(`Error adding package: ${error}`);
        }
    }

    private async _handleRemovePackageFromProject(packageName: string, projectPath: string) {
        try {
            // Get project name for display
            const projectName = projectPath.split(/[\\/]/).pop()?.replace('.csproj', '') || 'project';

            // Notify webview that remove is in progress
            this._panel.webview.postMessage({
                type: 'projectOperationInProgress',
                packageName: packageName,
                projectName: projectName,
                action: 'remove'
            });

            const success = await this.cpmManager.removePackageFromProject(packageName, projectPath);

            // Notify webview that operation is complete
            this._panel.webview.postMessage({
                type: 'projectOperationComplete',
                success: success
            });

            if (!success) {
                vscode.window.showWarningMessage(`Failed to remove ${packageName} from project`);
            }
            // Note: _updateWebview() is called automatically by onDidChange event after refresh()
        } catch (error) {
            console.error('Error removing package from project:', error);
            this._panel.webview.postMessage({
                type: 'projectOperationComplete',
                success: false
            });
            vscode.window.showErrorMessage(`Error removing package: ${error}`);
        }
    }

    public dispose() {
        PackageManagerPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getHtmlForWebview();
    }
}
