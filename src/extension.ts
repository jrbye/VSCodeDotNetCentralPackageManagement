import * as vscode from 'vscode';
import { XmlService } from './xmlService';
import { NuGetService } from './nugetService';
import { CpmManager } from './cpmManager';
import { CompletionProvider } from './completionProvider';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { addPackageCommand } from './commands/addPackage';
import { updateVersionCommand } from './commands/updateVersion';
import { removePackageCommand } from './commands/removePackage';
import { PackageManagerPanel } from './webview/packageManagerPanel';
import { AddPackagePanel } from './commands/addPackagePanel';

export async function activate(context: vscode.ExtensionContext) {
    console.log('.NET Central Package Management extension is now active');

    // Initialize services
    const xmlService = new XmlService();
    const nugetService = new NuGetService();
    const cpmManager = new CpmManager(xmlService, nugetService);

    // Initialize CPM Manager
    const initialized = await cpmManager.initialize();

    if (!initialized) {
        console.log('No Directory.Packages.props found in workspace');
    }

    // Note: Tree view removed - using Activity Bar with direct panel access instead

    // Register completion provider for Directory.Packages.props
    const completionProvider = new CompletionProvider(nugetService, cpmManager);
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'xml', pattern: '**/Directory.Packages.props' },
        completionProvider,
        '"', '='
    );

    // Register diagnostics provider
    const diagnosticsProvider = new DiagnosticsProvider(cpmManager, xmlService);

    // Register Activity Bar view to auto-open Package Manager
    const treeView = vscode.window.createTreeView('dotnetCpmWelcome', {
        treeDataProvider: {
            getTreeItem: (element: any) => element,
            getChildren: () => []
        }
    });

    // Auto-open Package Manager when Activity Bar icon is clicked
    let hasAutoOpened = false;
    treeView.onDidChangeVisibility(e => {
        if (e.visible && !hasAutoOpened) {
            hasAutoOpened = true;
            // Slight delay to ensure the view is fully shown
            setTimeout(() => {
                if (cpmManager.hasPropsFile()) {
                    PackageManagerPanel.createOrShow(context.extensionUri, cpmManager, nugetService);
                }
            }, 100);
        }
    });

    // Register commands
    const refreshCommand = vscode.commands.registerCommand('dotnetCpm.refresh', async () => {
        await cpmManager.refresh();
        vscode.window.showInformationMessage('Central packages refreshed');
    });

    const addPackageCmd = vscode.commands.registerCommand('dotnetCpm.addPackage', async () => {
        if (!cpmManager.hasPropsFile()) {
            vscode.window.showWarningMessage('No Directory.Packages.props found in workspace');
            return;
        }
        AddPackagePanel.createOrShow(context.extensionUri, cpmManager, nugetService);
    });

    const updateVersionCmd = vscode.commands.registerCommand(
        'dotnetCpm.updateVersion',
        async (item) => {
            if (!cpmManager.hasPropsFile()) {
                vscode.window.showWarningMessage('No Directory.Packages.props found in workspace');
                return;
            }
            await updateVersionCommand(cpmManager, nugetService, item);
        }
    );

    const removePackageCmd = vscode.commands.registerCommand(
        'dotnetCpm.removePackage',
        async (item) => {
            if (!cpmManager.hasPropsFile()) {
                vscode.window.showWarningMessage('No Directory.Packages.props found in workspace');
                return;
            }
            await removePackageCommand(cpmManager, item);
        }
    );

    const searchPackagesCmd = vscode.commands.registerCommand('dotnetCpm.searchPackages', async () => {
        if (!cpmManager.hasPropsFile()) {
            vscode.window.showWarningMessage('No Directory.Packages.props found in workspace');
            return;
        }
        AddPackagePanel.createOrShow(context.extensionUri, cpmManager, nugetService);
    });

    const checkForUpdatesCmd = vscode.commands.registerCommand('dotnetCpm.checkForUpdates', async () => {
        if (!cpmManager.hasPropsFile()) {
            vscode.window.showWarningMessage('No Directory.Packages.props found in workspace');
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Checking for package upgrades...',
                cancellable: false
            },
            async (progress) => {
                const packages = cpmManager.getAllPackages();
                let outdatedCount = 0;

                for (let i = 0; i < packages.length; i++) {
                    const pkg = packages[i];
                    progress.report({
                        message: `Checking ${pkg.name}...`,
                        increment: (100 / packages.length)
                    });

                    const result = await nugetService.isPackageOutdated(pkg.name, pkg.version);

                    if (result.isOutdated && result.latestVersion) {
                        outdatedCount++;
                        console.log(`${pkg.name}: ${pkg.version} -> ${result.latestVersion}`);
                    }
                }

                if (outdatedCount > 0) {
                    vscode.window.showInformationMessage(
                        `Found ${outdatedCount} package(s) with upgrades available. Check the console for details.`
                    );
                } else {
                    vscode.window.showInformationMessage('All packages are up to date!');
                }
            }
        );
    });

    // Open Directory.Packages.props command
    const openPropsFileCmd = vscode.commands.registerCommand('dotnetCpm.openPropsFile', async () => {
        const propsUri = cpmManager.getPropsFileUri();
        if (propsUri) {
            const document = await vscode.workspace.openTextDocument(propsUri);
            await vscode.window.showTextDocument(document);
        } else {
            vscode.window.showWarningMessage('No Directory.Packages.props found in workspace');
        }
    });

    // Open Package Manager Panel command
    const openPackageManagerCmd = vscode.commands.registerCommand('dotnetCpm.openPackageManager', () => {
        if (!cpmManager.hasPropsFile()) {
            vscode.window.showWarningMessage('No Directory.Packages.props found in workspace');
            return;
        }
        PackageManagerPanel.createOrShow(context.extensionUri, cpmManager, nugetService);
    });

    // Add all disposables to context
    context.subscriptions.push(
        treeView,
        completionDisposable,
        refreshCommand,
        addPackageCmd,
        updateVersionCmd,
        removePackageCmd,
        searchPackagesCmd,
        checkForUpdatesCmd,
        openPropsFileCmd,
        openPackageManagerCmd,
        cpmManager,
        diagnosticsProvider
    );

    // Update diagnostics on activation
    if (initialized) {
        await diagnosticsProvider.updateDiagnostics();
    }
}

export function deactivate() {
    console.log('.NET Central Package Management extension is now deactivated');
}
