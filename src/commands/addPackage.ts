import * as vscode from 'vscode';
import { CpmManager } from '../cpmManager';
import { NuGetService, NuGetSearchResult } from '../nugetService';

export async function addPackageCommand(
    cpmManager: CpmManager,
    nugetService: NuGetService
): Promise<void> {
    // Step 1: Select or create a category
    const labels = cpmManager.getLabels();
    const categoryOptions = [
        ...labels.map(label => ({ label, description: 'Existing category' })),
        { label: '$(add) Create New Category', description: 'Add a new category' }
    ];

    const selectedCategory = await vscode.window.showQuickPick(categoryOptions, {
        placeHolder: 'Select a category for the package',
        matchOnDescription: true
    });

    if (!selectedCategory) {
        return;
    }

    let categoryLabel: string | undefined;

    if (selectedCategory.label.startsWith('$(add)')) {
        // Create new category
        const newLabel = await vscode.window.showInputBox({
            prompt: 'Enter the name for the new category',
            placeHolder: 'e.g., "Database Providers", "Testing Frameworks"',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Category name cannot be empty';
                }
                if (labels.includes(value.trim())) {
                    return 'Category already exists';
                }
                return null;
            }
        });

        if (!newLabel) {
            return;
        }

        categoryLabel = newLabel.trim();
    } else {
        categoryLabel = selectedCategory.label;
    }

    // Step 2: Search for package
    const packageQuery = await vscode.window.showInputBox({
        prompt: 'Enter package name to search',
        placeHolder: 'e.g., Newtonsoft.Json, Microsoft.Extensions.Logging',
        validateInput: (value) => {
            if (!value || value.trim().length < 2) {
                return 'Package name must be at least 2 characters';
            }
            return null;
        }
    });

    if (!packageQuery) {
        return;
    }

    // Show progress while searching
    const showPrerelease = vscode.workspace.getConfiguration('dotnetCpm').get<boolean>('showPrereleaseVersions', false);
    const searchResults = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Searching NuGet packages...',
            cancellable: false
        },
        async () => {
            return await nugetService.searchPackages(packageQuery.trim(), showPrerelease, 20);
        }
    );

    if (searchResults.length === 0) {
        vscode.window.showWarningMessage(`No packages found matching "${packageQuery}"`);
        return;
    }

    // Step 3: Select package from search results
    const packageItems = searchResults.map(result => ({
        label: result.id,
        description: `v${result.version}`,
        detail: result.description,
        result: result
    }));

    const selectedPackage = await vscode.window.showQuickPick(packageItems, {
        placeHolder: 'Select a package',
        matchOnDetail: true
    });

    if (!selectedPackage) {
        return;
    }

    // Step 4: Select version
    let versions = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Fetching versions for ${selectedPackage.label}...`,
            cancellable: false
        },
        async () => {
            return await nugetService.getPackageVersions(selectedPackage.label);
        }
    );

    // Filter out prerelease versions if setting is disabled
    if (!showPrerelease) {
        versions = versions.filter(v => !v.includes('-'));
    }

    if (versions.length === 0) {
        vscode.window.showWarningMessage(`No versions found for ${selectedPackage.label}`);
        return;
    }

    // Reverse to show latest versions first
    const latestVersion = versions[versions.length - 1];
    const stableVersions = versions.filter(v => !v.includes('-'));
    const latestStable = stableVersions.length > 0 ? stableVersions[stableVersions.length - 1] : null;

    const versionItems = versions.reverse().map(version => {
        let description = '';
        if (version === latestVersion) {
            description = 'Latest';
        } else if (version === latestStable && latestVersion.includes('-')) {
            description = 'Latest Stable';
        }

        return {
            label: version,
            description: description,
            picked: version === latestStable || (latestStable === null && version === latestVersion)
        };
    });

    const selectedVersion = await vscode.window.showQuickPick(versionItems, {
        placeHolder: 'Select a version to install'
    });

    if (!selectedVersion) {
        return;
    }

    // Step 5: Add the package
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Adding ${selectedPackage.label}...`,
            cancellable: false
        },
        async () => {
            await cpmManager.addPackage(
                selectedPackage.label,
                selectedVersion.label,
                categoryLabel
            );
        }
    );
}
