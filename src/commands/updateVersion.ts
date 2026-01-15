import * as vscode from 'vscode';
import { CpmManager } from '../cpmManager';
import { NuGetService } from '../nugetService';
import { PackageTreeItem } from '../treeView/packageTreeItem';

export async function updateVersionCommand(
    cpmManager: CpmManager,
    nugetService: NuGetService,
    item?: PackageTreeItem
): Promise<void> {
    let packageName: string;
    let currentVersion: string;

    // If called from tree view context menu
    if (item && item.type === 'package' && item.packageData) {
        packageName = item.packageData.name;
        currentVersion = item.packageData.version;
    } else {
        // Called from command palette - need to select package
        const packages = cpmManager.getAllPackages();

        if (packages.length === 0) {
            vscode.window.showWarningMessage('No packages found in Directory.Packages.props');
            return;
        }

        const packageItems = packages.map(pkg => ({
            label: pkg.name,
            description: `v${pkg.version}`,
            pkg: pkg
        }));

        const selected = await vscode.window.showQuickPick(packageItems, {
            placeHolder: 'Select a package to upgrade'
        });

        if (!selected) {
            return;
        }

        packageName = selected.pkg.name;
        currentVersion = selected.pkg.version;
    }

    // Fetch available versions
    const showPrerelease = vscode.workspace.getConfiguration('dotnetCpm').get<boolean>('showPrereleaseVersions', false);
    let versions = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Fetching versions for ${packageName}...`,
            cancellable: false
        },
        async () => {
            return await nugetService.getPackageVersions(packageName);
        }
    );

    // Filter out prerelease versions if setting is disabled
    if (!showPrerelease) {
        versions = versions.filter(v => !v.includes('-'));
    }

    if (versions.length === 0) {
        vscode.window.showWarningMessage(`No versions found for ${packageName}`);
        return;
    }

    // Prepare version list
    const latestVersion = versions[versions.length - 1];
    const stableVersions = versions.filter(v => !v.includes('-'));
    const latestStable = stableVersions.length > 0 ? stableVersions[stableVersions.length - 1] : null;

    const versionItems = versions.reverse().map(version => {
        let description = '';
        const icons: string[] = [];

        if (version === currentVersion) {
            icons.push('$(check) Current');
        }

        if (version === latestVersion) {
            icons.push('$(arrow-up) Latest');
        } else if (version === latestStable && latestVersion.includes('-')) {
            icons.push('$(verified) Latest Stable');
        }

        return {
            label: version,
            description: icons.join(' '),
            picked: version === latestStable && version !== currentVersion
        };
    });

    const selectedVersion = await vscode.window.showQuickPick(versionItems, {
        placeHolder: `Select a version for ${packageName} (current: ${currentVersion})`
    });

    if (!selectedVersion) {
        return;
    }

    if (selectedVersion.label === currentVersion) {
        vscode.window.showInformationMessage(`Package ${packageName} is already at version ${currentVersion}`);
        return;
    }

    // Update the package version
    const isDowngrade = compareVersions(selectedVersion.label, currentVersion) < 0;
    const action = isDowngrade ? 'Downgrading' : 'Upgrading';

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `${action} ${packageName} to ${selectedVersion.label}...`,
            cancellable: false
        },
        async () => {
            await cpmManager.updatePackageVersion(packageName, selectedVersion.label);
        }
    );
}

function compareVersions(v1: string, v2: string): number {
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
