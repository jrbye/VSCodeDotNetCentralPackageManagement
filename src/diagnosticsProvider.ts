import * as vscode from 'vscode';
import { CpmManager } from './cpmManager';
import { XmlService } from './xmlService';
import { PackageAnalysisService, AnalysisResult } from './packageAnalysisService';

export class DiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private analysisDiagnosticCollection: vscode.DiagnosticCollection;

    constructor(
        private cpmManager: CpmManager,
        private xmlService: XmlService,
        private analysisService?: PackageAnalysisService
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('dotnetCpm');
        this.analysisDiagnosticCollection = vscode.languages.createDiagnosticCollection('dotnetCpmAnalysis');

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

        // Listen for analysis results
        if (this.analysisService) {
            this.analysisService.onDidChangeAnalysis((result) => {
                this.updateAnalysisDiagnostics(result);
            });
        }
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

    private updateAnalysisDiagnostics(result: AnalysisResult): void {
        const propsUri = this.cpmManager.getPropsFileUri();
        if (!propsUri || result.isRunning) {
            return;
        }

        // Read the props file to find line numbers
        vscode.workspace.openTextDocument(propsUri).then(document => {
            const diagnostics: vscode.Diagnostic[] = [];
            const text = document.getText();
            const lines = text.split('\n');

            // Transitive conflict diagnostics (CPM002)
            for (const conflict of result.transitiveConflicts) {
                const lineIndex = this.findPackageVersionLine(lines, conflict.packageId);
                if (lineIndex === -1) {
                    continue;
                }

                const line = lines[lineIndex];
                const includeIndex = line.indexOf('Include=');
                const startPos = new vscode.Position(lineIndex, includeIndex !== -1 ? includeIndex : 0);
                const endPos = new vscode.Position(lineIndex, line.trimEnd().length);
                const range = new vscode.Range(startPos, endPos);

                const parentsList = conflict.transitiveParents.length > 0
                    ? conflict.transitiveParents.join(', ')
                    : 'other packages';
                const projectsList = conflict.projects.join(', ');

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Transitive conflict: ${conflict.packageId} is set to ${conflict.centralVersion} but ${parentsList} transitively requires ${conflict.transitiveVersion} (in ${projectsList})`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'CPM002';
                diagnostic.source = '.NET CPM';
                diagnostics.push(diagnostic);
            }

            // Vulnerability diagnostics (CPM003)
            for (const vuln of result.vulnerablePackages) {
                const lineIndex = this.findPackageVersionLine(lines, vuln.packageId);
                if (lineIndex === -1) {
                    continue;
                }

                const line = lines[lineIndex];
                const versionIndex = line.indexOf('Version=');
                const startPos = new vscode.Position(lineIndex, versionIndex !== -1 ? versionIndex : 0);
                const endPos = new vscode.Position(lineIndex, line.trimEnd().length);
                const range = new vscode.Range(startPos, endPos);

                for (const v of vuln.vulnerabilities) {
                    const severity = this.mapVulnSeverity(v.severity);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Security vulnerability (${v.severity}): ${vuln.packageId}@${vuln.resolvedVersion}${vuln.isTransitive ? ' (transitive)' : ''}. Advisory: ${v.advisoryUrl}`,
                        severity
                    );
                    diagnostic.code = 'CPM003';
                    diagnostic.source = '.NET CPM';
                    diagnostics.push(diagnostic);
                }
            }

            this.analysisDiagnosticCollection.set(propsUri, diagnostics);
        });
    }

    private mapVulnSeverity(severity: string): vscode.DiagnosticSeverity {
        switch (severity.toLowerCase()) {
            case 'critical':
            case 'high':
                return vscode.DiagnosticSeverity.Error;
            case 'moderate':
                return vscode.DiagnosticSeverity.Warning;
            case 'low':
            default:
                return vscode.DiagnosticSeverity.Information;
        }
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

    private findPackageVersionLine(lines: string[], packageName: string): number {
        for (let i = 0; i < lines.length; i++) {
            if (
                lines[i].includes('<PackageVersion') &&
                lines[i].includes(`Include="${packageName}"`)
            ) {
                return i;
            }
        }
        return -1;
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
        this.analysisDiagnosticCollection.dispose();
    }
}
