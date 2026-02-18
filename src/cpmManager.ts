import * as vscode from 'vscode';
import * as path from 'path';
import { XmlService, Package, ItemGroup } from './xmlService';
import { NuGetService } from './nugetService';
import { compareVersions } from './versionUtils';

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

export interface ChangeHint {
    packageName?: string;
    projectPaths?: string[];
}

export class CpmManager {
    private xmlService: XmlService;
    private nugetService: NuGetService;
    private propsFileUri: vscode.Uri | null = null;
    private itemGroups: ItemGroup[] = [];
    private projects: ProjectInfo[] = [];
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private onDidChangeEmitter = new vscode.EventEmitter<ChangeHint | undefined>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(xmlService: XmlService, nugetService: NuGetService) {
        this.xmlService = xmlService;
        this.nugetService = nugetService;
    }

    async initialize(): Promise<boolean> {
        try {
            console.log('Initializing CPM Manager...');
            await this.findPropsFile();

            if (this.propsFileUri) {
                console.log(`Found Directory.Packages.props at: ${this.propsFileUri.fsPath}`);
                await this.loadPackages();
                await this.scanProjects();
                this.setupFileWatcher();
                this.onDidChangeEmitter.fire(undefined);
                console.log('CPM Manager initialization complete');
                return true;
            }

            console.log('No Directory.Packages.props found');
            return false;
        } catch (error) {
            console.error('Error during CPM Manager initialization:', error);
            throw error;
        }
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

        try {
            const propsData = await this.xmlService.readPropsFile(this.propsFileUri);

            if (propsData) {
                this.itemGroups = propsData.itemGroups;
                console.log(`Loaded ${this.itemGroups.length} package groups with ${this.getAllPackages().length} total packages`);
            } else {
                console.log('No package data found in Directory.Packages.props');
            }
        } catch (error) {
            console.error('Error loading packages:', error);
            throw error;
        }
    }

    private async scanProjects(): Promise<void> {
        try {
            const csprojFiles = await vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**');
            console.log(`Found ${csprojFiles.length} .csproj files`);

            const results = await Promise.all(
                csprojFiles.map(async (csprojUri) => {
                    try {
                        const [packages, versionedPackages] = await Promise.all([
                            this.xmlService.readCsprojFile(csprojUri),
                            this.xmlService.getPackageReferencesWithVersions(csprojUri)
                        ]);

                        if (packages) {
                            return {
                                path: csprojUri.fsPath,
                                name: path.basename(csprojUri.fsPath, '.csproj'),
                                packages: packages,
                                versionedPackages: versionedPackages || new Map()
                            } as ProjectInfo;
                        }
                        return null;
                    } catch (error) {
                        console.error(`Error reading project file ${csprojUri.fsPath}:`, error);
                        return null;
                    }
                })
            );

            this.projects = results.filter((p): p is ProjectInfo => p !== null);
            console.log(`Successfully loaded ${this.projects.length} projects`);
        } catch (error) {
            console.error('Error scanning projects:', error);
            throw error;
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

    async refresh(hint?: ChangeHint): Promise<void> {
        await Promise.all([this.loadPackages(), this.scanProjects()]);
        this.onDidChangeEmitter.fire(hint);
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
            await this.refresh({ packageName });
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
            const affectedPaths = this.projects
                .filter(p => p.packages.includes(packageName))
                .map(p => p.path);
            await this.refresh({ packageName, projectPaths: affectedPaths });
            const usedIn = this.getPackageUsage(packageName);
            const projectsText = usedIn.length > 0
                ? ` (used in ${usedIn.length} project${usedIn.length > 1 ? 's' : ''})`
                : '';

            // Determine if it's an upgrade or downgrade
            const isDowngrade = compareVersions(oldVersion, newVersion) > 0;
            const action = isDowngrade ? 'Downgraded' : 'Upgraded';

            vscode.window.showInformationMessage(
                `${action} ${packageName} to version ${newVersion}${projectsText}`
            );
        }

        return success;
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
            const affectedPaths = projectsUsingPackage.map(p => p.path);
            await this.refresh({ packageName, projectPaths: affectedPaths });
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
            await this.refresh({ packageName, projectPaths: [projectPath] });
            const projectName = path.basename(projectPath, '.csproj');
            vscode.window.showInformationMessage(`Added ${packageName} to ${projectName}`);
        }

        return success;
    }

    async removePackageFromProject(packageName: string, projectPath: string): Promise<boolean> {

        const projectUri = vscode.Uri.file(projectPath);
        const success = await this.xmlService.removePackageReferenceFromProject(projectUri, packageName);

        if (success) {
            await this.refresh({ packageName, projectPaths: [projectPath] });
            const projectName = path.basename(projectPath, '.csproj');
            vscode.window.showInformationMessage(`Removed ${packageName} from ${projectName}`);
        }

        return success;
    }

    getWorkspaceRoot(): string | null {
        if (this.propsFileUri) {
            return path.dirname(this.propsFileUri.fsPath);
        }
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
    }

    async getSolutionPath(): Promise<string | null> {
        const root = this.getWorkspaceRoot();
        if (!root) {
            return null;
        }
        const slnFiles = await vscode.workspace.findFiles('*.sln', '**/node_modules/**', 1);
        return slnFiles.length > 0 ? slnFiles[0].fsPath : null;
    }

    dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.onDidChangeEmitter.dispose();
    }
}
