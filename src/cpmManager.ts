import * as vscode from 'vscode';
import * as path from 'path';
import { XmlService, Package, ItemGroup } from './xmlService';
import { NuGetService } from './nugetService';

export interface PackageUsage {
    package: Package;
    usedInProjects: string[];
}

export interface ProjectInfo {
    path: string;
    name: string;
    packages: string[];
    versionedPackages: Map<string, string>;
}

export class CpmManager {
    private xmlService: XmlService;
    private nugetService: NuGetService;
    private propsFileUri: vscode.Uri | null = null;
    private itemGroups: ItemGroup[] = [];
    private projects: ProjectInfo[] = [];
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private onDidChangeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(xmlService: XmlService, nugetService: NuGetService) {
        this.xmlService = xmlService;
        this.nugetService = nugetService;
    }

    async initialize(): Promise<boolean> {
        await this.findPropsFile();

        if (this.propsFileUri) {
            await this.loadPackages();
            await this.scanProjects();
            this.setupFileWatcher();
            return true;
        }

        return false;
    }

    private async findPropsFile(): Promise<void> {
        const files = await vscode.workspace.findFiles('**/Directory.Packages.props', '**/node_modules/**', 1);

        if (files.length > 0) {
            this.propsFileUri = files[0];
        }
    }

    private async loadPackages(): Promise<void> {
        if (!this.propsFileUri) {
            return;
        }

        const propsData = await this.xmlService.readPropsFile(this.propsFileUri);

        if (propsData) {
            this.itemGroups = propsData.itemGroups;
        }
    }

    private async scanProjects(): Promise<void> {
        const csprojFiles = await vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**');

        this.projects = [];

        for (const csprojUri of csprojFiles) {
            const packages = await this.xmlService.readCsprojFile(csprojUri);
            const versionedPackages = await this.xmlService.getPackageReferencesWithVersions(csprojUri);

            if (packages) {
                this.projects.push({
                    path: csprojUri.fsPath,
                    name: path.basename(csprojUri.fsPath, '.csproj'),
                    packages: packages,
                    versionedPackages: versionedPackages || new Map()
                });
            }
        }
    }

    private setupFileWatcher(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }

        // Watch for changes to Directory.Packages.props and .csproj files
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            '**/{Directory.Packages.props,*.csproj}'
        );

        this.fileWatcher.onDidChange(async () => {
            await this.refresh();
        });

        this.fileWatcher.onDidCreate(async () => {
            await this.refresh();
        });

        this.fileWatcher.onDidDelete(async () => {
            await this.refresh();
        });
    }

    async refresh(): Promise<void> {
        await this.loadPackages();
        await this.scanProjects();
        this.onDidChangeEmitter.fire();
    }

    getItemGroups(): ItemGroup[] {
        return this.itemGroups;
    }

    getAllPackages(): Package[] {
        return this.itemGroups.flatMap(group => group.packages);
    }

    getPackagesByLabel(label?: string): Package[] {
        return this.itemGroups
            .filter(group => group.label === label)
            .flatMap(group => group.packages);
    }

    getLabels(): string[] {
        return this.itemGroups
            .map(group => group.label)
            .filter((label): label is string => label !== undefined);
    }

    getPackageUsage(packageName: string): string[] {
        return this.projects
            .filter(project => project.packages.includes(packageName))
            .map(project => project.name);
    }

    getPackageUsages(): PackageUsage[] {
        return this.getAllPackages().map(pkg => ({
            package: pkg,
            usedInProjects: this.getPackageUsage(pkg.name)
        }));
    }

    getVersionConflicts(): Array<{ project: string; package: string; version: string }> {
        const conflicts: Array<{ project: string; package: string; version: string }> = [];

        for (const project of this.projects) {
            for (const [pkgName, version] of project.versionedPackages) {
                // Check if this package is defined in Directory.Packages.props
                const centralPackage = this.getAllPackages().find(p => p.name === pkgName);

                if (centralPackage) {
                    conflicts.push({
                        project: project.name,
                        package: pkgName,
                        version: version
                    });
                }
            }
        }

        return conflicts;
    }

    async addPackage(
        packageName: string,
        version: string,
        label?: string
    ): Promise<boolean> {
        if (!this.propsFileUri) {
            return false;
        }

        const newPackage: Package = { name: packageName, version, label };

        // Find or create the appropriate ItemGroup
        let targetGroup = this.itemGroups.find(g => g.label === label);

        if (!targetGroup) {
            targetGroup = { label, packages: [] };
            this.itemGroups.push(targetGroup);
        }

        // Check if package already exists
        if (targetGroup.packages.some(p => p.name === packageName)) {
            vscode.window.showWarningMessage(`Package ${packageName} already exists in ${label || 'this group'}`);
            return false;
        }

        targetGroup.packages.push(newPackage);

        // Sort packages alphabetically within the group
        targetGroup.packages.sort((a, b) => a.name.localeCompare(b.name));

        const success = await this.xmlService.writePropsFile(this.propsFileUri, this.itemGroups);

        if (success) {
            await this.refresh();
            vscode.window.showInformationMessage(`Added package ${packageName} @ ${version}`);
        }

        return success;
    }

    async updatePackageVersion(packageName: string, newVersion: string): Promise<boolean> {
        if (!this.propsFileUri) {
            return false;
        }

        let updated = false;
        let oldVersion = '';

        for (const group of this.itemGroups) {
            const pkg = group.packages.find(p => p.name === packageName);
            if (pkg) {
                oldVersion = pkg.version;
                pkg.version = newVersion;
                updated = true;
                break;
            }
        }

        if (!updated) {
            return false;
        }

        const success = await this.xmlService.writePropsFile(this.propsFileUri, this.itemGroups);

        if (success) {
            await this.refresh();
            const usedIn = this.getPackageUsage(packageName);
            const projectsText = usedIn.length > 0
                ? ` (used in ${usedIn.length} project${usedIn.length > 1 ? 's' : ''})`
                : '';

            // Determine if it's an upgrade or downgrade
            const isDowngrade = this.compareVersions(oldVersion, newVersion) > 0;
            const action = isDowngrade ? 'Downgraded' : 'Upgraded';

            vscode.window.showInformationMessage(
                `${action} ${packageName} to version ${newVersion}${projectsText}`
            );
        }

        return success;
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

    async removePackage(packageName: string): Promise<boolean> {
        if (!this.propsFileUri) {
            return false;
        }

        // Check if package is used
        const usedIn = this.getPackageUsage(packageName);
        const projectsUsingPackage = this.projects.filter(p =>
            p.packages.includes(packageName)
        );

        if (usedIn.length > 0) {
            const answer = await vscode.window.showWarningMessage(
                `Package ${packageName} is used in ${usedIn.length} project(s): ${usedIn.join(', ')}. This will remove it from all projects and Directory.Packages.props.`,
                { modal: true },
                'Remove', 'Cancel'
            );

            if (answer !== 'Remove') {
                return false;
            }

            // Remove PackageReference from all projects that use it
            for (const project of projectsUsingPackage) {
                const projectUri = vscode.Uri.file(project.path);
                await this.xmlService.removePackageReferenceFromProject(projectUri, packageName);
            }
        } else {
            // Package not used in any projects, still confirm removal
            const answer = await vscode.window.showWarningMessage(
                `Are you sure you want to remove package ${packageName}?`,
                { modal: true },
                'Remove', 'Cancel'
            );

            if (answer !== 'Remove') {
                return false;
            }
        }

        let removed = false;

        for (const group of this.itemGroups) {
            const index = group.packages.findIndex(p => p.name === packageName);
            if (index !== -1) {
                group.packages.splice(index, 1);
                removed = true;
                break;
            }
        }

        if (!removed) {
            return false;
        }

        // Remove empty groups
        this.itemGroups = this.itemGroups.filter(g => g.packages.length > 0);

        const success = await this.xmlService.writePropsFile(this.propsFileUri, this.itemGroups);

        if (success) {
            await this.refresh();
            vscode.window.showInformationMessage(`Removed package ${packageName}`);
        }

        return success;
    }

    getPropsFileUri(): vscode.Uri | null {
        return this.propsFileUri;
    }

    hasPropsFile(): boolean {
        return this.propsFileUri !== null;
    }

    getAllProjects(): ProjectInfo[] {
        // Return projects sorted alphabetically by name
        return [...this.projects].sort((a, b) => a.name.localeCompare(b.name));
    }

    async addPackageToProject(packageName: string, projectPath: string): Promise<boolean> {
        // Ensure Directory.Build.props exists with ManagePackageVersionsCentrally
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            await this.xmlService.ensureDirectoryBuildProps(workspaceRoot);
        }

        const projectUri = vscode.Uri.file(projectPath);
        const success = await this.xmlService.addPackageReferenceToProject(projectUri, packageName);

        if (success) {
            await this.refresh();
            const projectName = path.basename(projectPath, '.csproj');
            vscode.window.showInformationMessage(`Added ${packageName} to ${projectName}`);
        }

        return success;
    }

    async removePackageFromProject(packageName: string, projectPath: string): Promise<boolean> {
        const projectUri = vscode.Uri.file(projectPath);
        const success = await this.xmlService.removePackageReferenceFromProject(projectUri, packageName);

        if (success) {
            await this.refresh();
            const projectName = path.basename(projectPath, '.csproj');
            vscode.window.showInformationMessage(`Removed ${packageName} from ${projectName}`);
        }

        return success;
    }

    dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.onDidChangeEmitter.dispose();
    }
}
