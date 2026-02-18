import * as vscode from 'vscode';
import { XmlService } from './xmlService';
import { NuGetService } from './nugetService';
import { CpmManager } from './cpmManager';
import { CompletionProvider } from './completionProvider';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { DotnetCliService } from './dotnetCliService';
import { PackageAnalysisService } from './packageAnalysisService';
import { addPackageCommand } from './commands/addPackage';
import { updateVersionCommand } from './commands/updateVersion';
import { removePackageCommand } from './commands/removePackage';
import { PackageManagerPanel } from './webview/packageManagerPanel';
import { AddPackagePanel } from './commands/addPackagePanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('=== .NET CPM v0.2.0 Activation Started ===');
    console.log('.NET Central Package Management extension is now active');

    // Initialize services
    const xmlService = new XmlService();
    const nugetService = new NuGetService();
    const cpmManager = new CpmManager(xmlService, nugetService);
    const dotnetCliService = new DotnetCliService();
    const analysisService = new PackageAnalysisService(dotnetCliService, cpmManager);

    // Register completion provider for Directory.Packages.props
    const completionProvider = new CompletionProvider(nugetService, cpmManager);
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'xml', pattern: '**/Directory.Packages.props' },
        completionProvider,
        '"', '='
    );

    // Register diagnostics provider
    const diagnosticsProvider = new DiagnosticsProvider(cpmManager, xmlService, analysisService);

    // Initialize CPM Manager in background (don't block activation)
    cpmManager.initialize().then(initialized => {
        if (initialized) {
            console.log('CPM Manager initialized successfully');
            // Update diagnostics after successful initialization
            diagnosticsProvider.updateDiagnostics().catch(err => {
                console.error('Error updating diagnostics:', err);
            });

            // Run initial dependency analysis in background
            const analysisEnabled = vscode.workspace.getConfiguration('dotnetCpm').get<boolean>('enableAnalysis', true);
            if (analysisEnabled) {
                console.log('[Analysis] Starting initial analysis on startup');
                analysisService.runFullAnalysis().then(() => {
                    console.log('[Analysis] Initial startup analysis complete');
                }).catch(err => {
                    console.error('Error running initial package analysis:', err);
                });
            }

            // Pre-load the NuGet vulnerability database in background
            nugetService.ensureVulnerabilityDb().catch(err => {
                console.warn('Failed to pre-load vulnerability database:', err);
            });

            // Always auto-open the Package Manager panel after successful initialization
            hasAutoOpened = true;
            PackageManagerPanel.createOrShow(context.extensionUri, cpmManager, nugetService, analysisService);
        } else {
            console.log('No Directory.Packages.props found in workspace');
        }
    }).catch(error => {
        console.error('Error initializing CPM Manager:', error);
        vscode.window.showErrorMessage(`Failed to initialize .NET CPM: ${error.message}`);
    });

    // No auto-analysis after changes. Analysis runs once at startup and
    // on-demand via the "Run Analysis" button/command.

    // Note: Tree view removed - using Activity Bar with direct panel access instead

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
                    PackageManagerPanel.createOrShow(context.extensionUri, cpmManager, nugetService, analysisService);
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

    // Run Analysis command
    const runAnalysisCmd = vscode.commands.registerCommand('dotnetCpm.runAnalysis', async () => {
        if (!cpmManager.hasPropsFile()) {
            vscode.window.showWarningMessage('No Directory.Packages.props found in workspace');
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing dependencies...',
                cancellable: false
            },
            async () => {
                const result = await analysisService.runFullAnalysis(true);
                const totalIssues = result.transitiveConflicts.length + result.vulnerablePackages.length;
                if (result.error) {
                    vscode.window.showWarningMessage(`Analysis completed with errors: ${result.error}`);
                } else if (totalIssues > 0) {
                    vscode.window.showWarningMessage(
                        `Found ${result.transitiveConflicts.length} transitive conflict(s) and ${result.vulnerablePackages.length} vulnerable package(s).`
                    );
                } else {
                    vscode.window.showInformationMessage('No dependency issues found.');
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
        PackageManagerPanel.createOrShow(context.extensionUri, cpmManager, nugetService, analysisService);
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
        runAnalysisCmd,
        openPropsFileCmd,
        openPackageManagerCmd,
        cpmManager,
        diagnosticsProvider,
        dotnetCliService,
        analysisService
    );

    // Update diagnostics will happen after initialization completes
    console.log('=== .NET CPM v0.2.0 Activation Complete ===');
}

export function deactivate() {
    console.log('.NET Central Package Management extension is now deactivated');
}
