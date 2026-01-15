import * as vscode from 'vscode';
import { CpmManager } from '../cpmManager';
import { PackageTreeItem } from './packageTreeItem';
import { ItemGroup } from '../xmlService';

export class PackageTreeProvider implements vscode.TreeDataProvider<PackageTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<PackageTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private cpmManager: CpmManager) {
        // Listen to CPM manager changes
        this.cpmManager.onDidChange(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PackageTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PackageTreeItem): Promise<PackageTreeItem[]> {
        if (!this.cpmManager.hasPropsFile()) {
            vscode.window.showInformationMessage(
                'No Directory.Packages.props file found in workspace'
            );
            return [];
        }

        // Root level - show categories
        if (!element) {
            return this.getRootItems();
        }

        // Category level - show packages in that category
        if (element.type === 'category') {
            return this.getPackagesInCategory(element.categoryLabel);
        }

        // Package level - show which projects use this package
        if (element.type === 'package' && element.packageData) {
            return this.getPackageUsages(element.packageData.name);
        }

        return [];
    }

    private getRootItems(): PackageTreeItem[] {
        const itemGroups = this.cpmManager.getItemGroups();

        if (itemGroups.length === 0) {
            return [];
        }

        // Create a tree item for each category
        return itemGroups.map(group => {
            const label = group.label || 'Uncategorized';
            return PackageTreeItem.createCategory(label, group.packages.length);
        });
    }

    private getPackagesInCategory(categoryLabel?: string): PackageTreeItem[] {
        const packages = this.cpmManager.getPackagesByLabel(categoryLabel);

        return packages.map(pkg => PackageTreeItem.createPackage(pkg));
    }

    private getPackageUsages(packageName: string): PackageTreeItem[] {
        const usages = this.cpmManager.getPackageUsage(packageName);

        if (usages.length === 0) {
            const noUsageItem = new PackageTreeItem(
                'Not used in any project',
                'usage',
                vscode.TreeItemCollapsibleState.None
            );
            noUsageItem.iconPath = new vscode.ThemeIcon('info');
            return [noUsageItem];
        }

        return usages.map(projectName => PackageTreeItem.createUsage(projectName));
    }
}
