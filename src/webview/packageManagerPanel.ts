import * as vscode from 'vscode';
import { CpmManager } from '../cpmManager';
import { NuGetService } from '../nugetService';
import { Package } from '../xmlService';
import { getHtmlForWebview } from './packageManagerPanelHtml';

export class PackageManagerPanel {
    public static currentPanel: PackageManagerPanel | undefined;
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

        // Listen to CPM manager changes
        this.cpmManager.onDidChange(() => {
            this._updateWebview();
        });

        // Send initial data
        this._updateWebview();
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        cpmManager: CpmManager,
        nugetService: NuGetService
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
            extensionUri
        );
    }

    private async _updateWebview() {
        const itemGroups = this.cpmManager.getItemGroups();
        const packages = this.cpmManager.getAllPackages();
        const allProjects = this.cpmManager.getAllProjects();

        // Fetch icon URLs and update info for all packages
        const packagesWithInfo = await Promise.all(
            packages.map(async pkg => {
                const info = await this.nugetService.getPackageInfo(pkg.name, pkg.version);
                const updateInfo = await this.nugetService.isPackageOutdated(pkg.name, pkg.version);
                return {
                    name: pkg.name,
                    version: pkg.version,
                    label: pkg.label,
                    usedIn: this.cpmManager.getPackageUsage(pkg.name),
                    iconUrl: info?.iconUrl || '',
                    hasUpdate: updateInfo.isOutdated,
                    latestVersion: updateInfo.latestVersion
                };
            })
        );

        this._panel.webview.postMessage({
            type: 'updatePackages',
            itemGroups: itemGroups,
            packages: packagesWithInfo,
            allProjects: allProjects.map(p => ({ name: p.name, path: p.path }))
        });
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'getPackageInfo':
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
                        await this.cpmManager.refresh();
                        break;
                    case 'addPackageToProject':
                        await this._handleAddPackageToProject(message.packageName, message.projectPath);
                        break;
                    case 'removePackageFromProject':
                        await this._handleRemovePackageFromProject(message.packageName, message.projectPath);
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

            this._panel.webview.postMessage({
                type: 'versionsData',
                packageName: packageName,
                currentVersion: currentVersion,
                versions: versions.reverse(),
                latestVersion: latestVersion,
                isOutdated: isOutdated
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch versions for ${packageName}`);
        }
    }

    private async _handleUpdatePackage(packageName: string, version: string) {
        // Get current version to determine if it's an upgrade or downgrade
        const pkg = this.cpmManager.getAllPackages().find(p => p.name === packageName);
        const currentVersion = pkg?.version || '';
        const isDowngrade = this.compareVersions(currentVersion, version) > 0;
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

    private compareVersions(v1: string, v2: string): number {
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

    private async _handleRemovePackage(packageName: string) {
        try {
            // cpmManager.removePackage handles confirmation dialog
            const success = await this.cpmManager.removePackage(packageName);
            if (success) {
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
