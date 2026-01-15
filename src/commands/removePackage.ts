import * as vscode from 'vscode';
import { CpmManager } from '../cpmManager';
import { PackageTreeItem } from '../treeView/packageTreeItem';

export async function removePackageCommand(
    cpmManager: CpmManager,
    item?: PackageTreeItem
): Promise<void> {
    let packageName: string;

    // If called from tree view context menu
    if (item && item.type === 'package' && item.packageData) {
        packageName = item.packageData.name;
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
            detail: pkg.label ? `Category: ${pkg.label}` : undefined
        }));

        const selected = await vscode.window.showQuickPick(packageItems, {
            placeHolder: 'Select a package to remove'
        });

        if (!selected) {
            return;
        }

        packageName = selected.label;
    }

    // Check usage and confirm
    const usages = cpmManager.getPackageUsage(packageName);

    let confirmMessage = `Remove package ${packageName}?`;
    if (usages.length > 0) {
        confirmMessage = `Package ${packageName} is used in ${usages.length} project(s): ${usages.join(', ')}. Remove from Directory.Packages.props anyway?`;
    }

    const answer = await vscode.window.showWarningMessage(
        confirmMessage,
        { modal: true },
        'Remove',
        'Cancel'
    );

    if (answer !== 'Remove') {
        return;
    }

    // Remove the package
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Removing ${packageName}...`,
            cancellable: false
        },
        async () => {
            await cpmManager.removePackage(packageName);
        }
    );
}
