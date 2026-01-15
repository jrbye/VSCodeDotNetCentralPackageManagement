import * as vscode from 'vscode';
import { CpmManager } from './cpmManager';
import { XmlService } from './xmlService';

export class DiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor(
        private cpmManager: CpmManager,
        private xmlService: XmlService
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('dotnetCpm');

        // Listen for CPM manager changes
        this.cpmManager.onDidChange(() => {
            this.updateDiagnostics();
        });

        // Listen for document changes
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.fileName.endsWith('.csproj')) {
                this.updateDiagnosticsForDocument(event.document);
            }
        });

        // Listen for document open
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.fileName.endsWith('.csproj')) {
                this.updateDiagnosticsForDocument(document);
            }
        });
    }

    async updateDiagnostics(): Promise<void> {
        // Update diagnostics for all open .csproj files
        for (const document of vscode.workspace.textDocuments) {
            if (document.fileName.endsWith('.csproj')) {
                await this.updateDiagnosticsForDocument(document);
            }
        }

        // Also scan all .csproj files in workspace
        const csprojFiles = await vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**');
        for (const uri of csprojFiles) {
            const document = await vscode.workspace.openTextDocument(uri);
            await this.updateDiagnosticsForDocument(document);
        }
    }

    private async updateDiagnosticsForDocument(document: vscode.TextDocument): Promise<void> {
        if (!this.cpmManager.hasPropsFile()) {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Check for PackageReference elements with Version attributes
        const packageReferencesWithVersion = await this.xmlService.getPackageReferencesWithVersions(
            document.uri
        );

        if (packageReferencesWithVersion) {
            const centralPackages = this.cpmManager.getAllPackages();

            for (const [packageName, version] of packageReferencesWithVersion) {
                // Find if this package is centrally managed
                const centralPackage = centralPackages.find(p => p.name === packageName);

                if (centralPackage) {
                    // Find the line with this PackageReference
                    const lineIndex = this.findPackageReferenceLine(lines, packageName);

                    if (lineIndex !== -1) {
                        const line = lines[lineIndex];
                        const versionIndex = line.indexOf('Version=');

                        if (versionIndex !== -1) {
                            const startPos = new vscode.Position(lineIndex, versionIndex);
                            const endPos = new vscode.Position(lineIndex, line.length);
                            const range = new vscode.Range(startPos, endPos);

                            const diagnostic = new vscode.Diagnostic(
                                range,
                                `Package version should be managed centrally. Remove the Version attribute. Central version is ${centralPackage.version}`,
                                vscode.DiagnosticSeverity.Warning
                            );

                            diagnostic.code = 'CPM001';
                            diagnostic.source = '.NET CPM';
                            diagnostics.push(diagnostic);
                        }
                    }
                }
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private findPackageReferenceLine(lines: string[], packageName: string): number {
        for (let i = 0; i < lines.length; i++) {
            if (
                lines[i].includes('<PackageReference') &&
                lines[i].includes(`Include="${packageName}"`)
            ) {
                return i;
            }
        }
        return -1;
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
