import * as vscode from 'vscode';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export interface Package {
    name: string;
    version: string;
    label?: string;
}

export interface ItemGroup {
    label?: string;
    packages: Package[];
}

export interface DirectoryPackagesProps {
    managePackageVersionsCentrally: boolean;
    itemGroups: ItemGroup[];
}

export class XmlService {
    private parser: XMLParser;
    private builder: XMLBuilder;

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            parseAttributeValue: false,
            allowBooleanAttributes: true,
            trimValues: true
        });

        this.builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            format: true,
            indentBy: '  ',
            suppressEmptyNode: true
        });
    }

    async readPropsFile(uri: vscode.Uri): Promise<DirectoryPackagesProps | null> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            return this.parsePropsContent(content);
        } catch (error) {
            console.error('Error reading props file:', error);
            return null;
        }
    }

    parsePropsContent(content: string): DirectoryPackagesProps | null {
        try {
            const parsed = this.parser.parse(content);

            if (!parsed.Project) {
                return null;
            }

            const project = parsed.Project;
            const value = project.PropertyGroup?.ManagePackageVersionsCentrally;
            const managePackageVersionsCentrally = value === 'true' || value === true;

            const itemGroups: ItemGroup[] = [];

            // Handle single ItemGroup or array of ItemGroups
            const itemGroupsRaw = Array.isArray(project.ItemGroup)
                ? project.ItemGroup
                : (project.ItemGroup ? [project.ItemGroup] : []);

            for (const itemGroup of itemGroupsRaw) {
                const label = itemGroup['@_Label'];
                const packages: Package[] = [];

                // Handle PackageVersion elements
                const packageVersions = Array.isArray(itemGroup.PackageVersion)
                    ? itemGroup.PackageVersion
                    : (itemGroup.PackageVersion ? [itemGroup.PackageVersion] : []);

                for (const pkg of packageVersions) {
                    if (pkg['@_Include'] && pkg['@_Version']) {
                        packages.push({
                            name: pkg['@_Include'],
                            version: pkg['@_Version'],
                            label
                        });
                    }
                }

                if (packages.length > 0) {
                    itemGroups.push({ label, packages });
                }
            }

            return {
                managePackageVersionsCentrally,
                itemGroups
            };
        } catch (error) {
            console.error('Error parsing props content:', error);
            return null;
        }
    }

    async writePropsFile(uri: vscode.Uri, itemGroups: ItemGroup[]): Promise<boolean> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            const parsed = this.parser.parse(content);

            if (!parsed.Project) {
                return false;
            }

            // Rebuild ItemGroups
            const newItemGroups = itemGroups.map(group => {
                const itemGroup: any = {};

                if (group.label) {
                    itemGroup['@_Label'] = group.label;
                }

                itemGroup.PackageVersion = group.packages.map(pkg => ({
                    '@_Include': pkg.name,
                    '@_Version': pkg.version
                }));

                return itemGroup;
            });

            parsed.Project.ItemGroup = newItemGroups;

            const newContent = this.builder.build(parsed);
            // Only add XML declaration if not already present
            const fullContent = newContent.startsWith('<?xml')
                ? newContent
                : '<?xml version="1.0" encoding="utf-8"?>\n' + newContent;

            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(content.length)
            );
            edit.replace(uri, fullRange, fullContent);

            await vscode.workspace.applyEdit(edit);
            await document.save();

            return true;
        } catch (error) {
            console.error('Error writing props file:', error);
            return false;
        }
    }

    async readCsprojFile(uri: vscode.Uri): Promise<string[] | null> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            const parsed = this.parser.parse(content);

            if (!parsed.Project) {
                return null;
            }

            const packages: string[] = [];
            const itemGroups = Array.isArray(parsed.Project.ItemGroup)
                ? parsed.Project.ItemGroup
                : (parsed.Project.ItemGroup ? [parsed.Project.ItemGroup] : []);

            for (const itemGroup of itemGroups) {
                const packageReferences = Array.isArray(itemGroup.PackageReference)
                    ? itemGroup.PackageReference
                    : (itemGroup.PackageReference ? [itemGroup.PackageReference] : []);

                for (const pkgRef of packageReferences) {
                    if (pkgRef['@_Include']) {
                        packages.push(pkgRef['@_Include']);
                    }
                }
            }

            return packages;
        } catch (error) {
            console.error('Error reading csproj file:', error);
            return null;
        }
    }

    async getPackageReferencesWithVersions(uri: vscode.Uri): Promise<Map<string, string> | null> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            const parsed = this.parser.parse(content);

            if (!parsed.Project) {
                return null;
            }

            const packages = new Map<string, string>();
            const itemGroups = Array.isArray(parsed.Project.ItemGroup)
                ? parsed.Project.ItemGroup
                : (parsed.Project.ItemGroup ? [parsed.Project.ItemGroup] : []);

            for (const itemGroup of itemGroups) {
                const packageReferences = Array.isArray(itemGroup.PackageReference)
                    ? itemGroup.PackageReference
                    : (itemGroup.PackageReference ? [itemGroup.PackageReference] : []);

                for (const pkgRef of packageReferences) {
                    const include = pkgRef['@_Include'];
                    const version = pkgRef['@_Version'];

                    if (include && version) {
                        packages.set(include, version);
                    }
                }
            }

            return packages;
        } catch (error) {
            console.error('Error reading package references with versions:', error);
            return null;
        }
    }

    async addPackageReferenceToProject(uri: vscode.Uri, packageName: string): Promise<boolean> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            const parsed = this.parser.parse(content);

            if (!parsed.Project) {
                return false;
            }

            // Check if package already exists
            const existingPackages = await this.readCsprojFile(uri);
            if (existingPackages?.includes(packageName)) {
                return false; // Package already exists
            }

            // Find or create an ItemGroup for PackageReference
            let itemGroups = Array.isArray(parsed.Project.ItemGroup)
                ? parsed.Project.ItemGroup
                : (parsed.Project.ItemGroup ? [parsed.Project.ItemGroup] : []);

            // Find an ItemGroup that has PackageReference elements
            let targetGroup = itemGroups.find((group: any) => group.PackageReference);

            if (!targetGroup) {
                // Create new ItemGroup if none exist with PackageReference
                targetGroup = {};
                itemGroups.push(targetGroup);
                parsed.Project.ItemGroup = itemGroups;
            }

            // Add the package reference
            const newPackageRef = { '@_Include': packageName };

            if (!targetGroup.PackageReference) {
                targetGroup.PackageReference = [newPackageRef];
            } else if (Array.isArray(targetGroup.PackageReference)) {
                targetGroup.PackageReference.push(newPackageRef);
            } else {
                targetGroup.PackageReference = [targetGroup.PackageReference, newPackageRef];
            }

            // Build and save
            const newContent = this.builder.build(parsed);
            const fullContent = newContent.startsWith('<?xml')
                ? newContent
                : '<?xml version="1.0" encoding="utf-8"?>\n' + newContent;

            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(content.length)
            );
            edit.replace(uri, fullRange, fullContent);

            await vscode.workspace.applyEdit(edit);
            await document.save();

            return true;
        } catch (error) {
            console.error('Error adding package reference to project:', error);
            return false;
        }
    }

    async ensureDirectoryBuildProps(workspaceRoot: string): Promise<void> {
        const directoryBuildPropsPath = vscode.Uri.file(`${workspaceRoot}/Directory.Build.props`);

        try {
            // Check if file exists
            await vscode.workspace.fs.stat(directoryBuildPropsPath);
            // File exists, check if it has ManagePackageVersionsCentrally
            const document = await vscode.workspace.openTextDocument(directoryBuildPropsPath);
            const content = document.getText();

            if (!content.includes('ManagePackageVersionsCentrally')) {
                // Add the property if it doesn't exist
                const parsed = this.parser.parse(content);
                if (!parsed.Project) {
                    parsed.Project = {};
                }
                if (!parsed.Project.PropertyGroup) {
                    parsed.Project.PropertyGroup = {};
                }
                if (Array.isArray(parsed.Project.PropertyGroup)) {
                    parsed.Project.PropertyGroup[0].ManagePackageVersionsCentrally = 'true';
                } else {
                    parsed.Project.PropertyGroup.ManagePackageVersionsCentrally = 'true';
                }

                const newContent = this.builder.build(parsed);
                const fullContent = newContent.startsWith('<?xml')
                    ? newContent
                    : '<?xml version="1.0" encoding="utf-8"?>\n' + newContent;

                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(content.length)
                );
                edit.replace(directoryBuildPropsPath, fullRange, fullContent);
                await vscode.workspace.applyEdit(edit);
                await document.save();
            }
        } catch (error) {
            // File doesn't exist, create it
            const content = `<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
</Project>`;

            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(directoryBuildPropsPath, encoder.encode(content));
        }
    }

    async removePackageReferenceFromProject(uri: vscode.Uri, packageName: string): Promise<boolean> {
        try {
            console.log(`Attempting to remove ${packageName} from ${uri.fsPath}`);
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            const parsed = this.parser.parse(content);

            if (!parsed.Project) {
                console.error('No Project element found in csproj');
                return false;
            }

            let removed = false;
            const itemGroups = Array.isArray(parsed.Project.ItemGroup)
                ? parsed.Project.ItemGroup
                : (parsed.Project.ItemGroup ? [parsed.Project.ItemGroup] : []);

            console.log(`Found ${itemGroups.length} ItemGroups`);

            for (const itemGroup of itemGroups) {
                if (!itemGroup.PackageReference) {
                    continue;
                }

                if (Array.isArray(itemGroup.PackageReference)) {
                    console.log(`Checking array of ${itemGroup.PackageReference.length} PackageReferences`);
                    const index = itemGroup.PackageReference.findIndex(
                        (ref: any) => ref['@_Include'] === packageName
                    );
                    if (index !== -1) {
                        console.log(`Found package at index ${index}, removing...`);
                        itemGroup.PackageReference.splice(index, 1);
                        // If array becomes empty, remove the property
                        if (itemGroup.PackageReference.length === 0) {
                            delete itemGroup.PackageReference;
                        } else if (itemGroup.PackageReference.length === 1) {
                            // Convert single-element array to single object
                            itemGroup.PackageReference = itemGroup.PackageReference[0];
                        }
                        removed = true;
                        break;
                    }
                } else {
                    console.log(`Checking single PackageReference: ${itemGroup.PackageReference['@_Include']}`);
                    if (itemGroup.PackageReference['@_Include'] === packageName) {
                        console.log('Found matching package, removing...');
                        delete itemGroup.PackageReference;
                        removed = true;
                        break;
                    }
                }
            }

            if (!removed) {
                console.error(`Package ${packageName} not found in project`);
                return false;
            }

            // Build and save
            const newContent = this.builder.build(parsed);
            const fullContent = newContent.startsWith('<?xml')
                ? newContent
                : '<?xml version="1.0" encoding="utf-8"?>\n' + newContent;

            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(content.length)
            );
            edit.replace(uri, fullRange, fullContent);

            await vscode.workspace.applyEdit(edit);
            await document.save();

            return true;
        } catch (error) {
            console.error('Error removing package reference from project:', error);
            return false;
        }
    }
}
