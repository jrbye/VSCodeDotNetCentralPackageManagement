import * as vscode from 'vscode';
import { Package } from '../xmlService';

export type TreeItemType = 'root' | 'category' | 'package' | 'usage';

export class PackageTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: TreeItemType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly packageData?: Package,
        public readonly categoryLabel?: string
    ) {
        super(label, collapsibleState);

        this.contextValue = type;
        this.setupItem();
    }

    private setupItem(): void {
        switch (this.type) {
            case 'root':
                this.iconPath = new vscode.ThemeIcon('package');
                this.description = '';
                break;

            case 'category':
                this.iconPath = new vscode.ThemeIcon('symbol-namespace');
                this.tooltip = `Category: ${this.label}`;
                break;

            case 'package':
                if (this.packageData) {
                    this.iconPath = new vscode.ThemeIcon('symbol-package');
                    this.description = `@ ${this.packageData.version}`;
                    this.tooltip = new vscode.MarkdownString(
                        `**${this.packageData.name}**\n\nVersion: \`${this.packageData.version}\``
                    );
                }
                break;

            case 'usage':
                this.iconPath = new vscode.ThemeIcon('file-code');
                this.tooltip = `Used in project: ${this.label}`;
                this.command = {
                    command: 'vscode.open',
                    title: 'Open Project',
                    arguments: [vscode.Uri.file(this.label)]
                };
                break;
        }
    }

    static createRoot(packageCount: number): PackageTreeItem {
        return new PackageTreeItem(
            `Central Packages (${packageCount})`,
            'root',
            vscode.TreeItemCollapsibleState.Expanded
        );
    }

    static createCategory(label: string, packageCount: number): PackageTreeItem {
        return new PackageTreeItem(
            `${label} (${packageCount})`,
            'category',
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            label
        );
    }

    static createPackage(pkg: Package): PackageTreeItem {
        return new PackageTreeItem(
            pkg.name,
            'package',
            vscode.TreeItemCollapsibleState.Collapsed,
            pkg
        );
    }

    static createUsage(projectName: string): PackageTreeItem {
        return new PackageTreeItem(
            projectName,
            'usage',
            vscode.TreeItemCollapsibleState.None
        );
    }
}
