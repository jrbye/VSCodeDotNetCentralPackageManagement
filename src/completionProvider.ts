import * as vscode from 'vscode';
import { NuGetService } from './nugetService';
import { CpmManager } from './cpmManager';

export class CompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private nugetService: NuGetService,
        private cpmManager: CpmManager
    ) {}

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        const lineText = document.lineAt(position.line).text;
        const linePrefix = lineText.substring(0, position.character);

        // Check if we're in a PackageVersion Include attribute
        if (linePrefix.includes('<PackageVersion') && linePrefix.includes('Include="')) {
            const match = linePrefix.match(/Include="([^"]*)$/);
            if (match) {
                return await this.providePackageNameCompletions(match[1]);
            }
        }

        // Check if we're in a Version attribute
        if (linePrefix.includes('<PackageVersion') && linePrefix.includes('Version="')) {
            const includeMatch = lineText.match(/Include="([^"]+)"/);
            if (includeMatch) {
                const packageName = includeMatch[1];
                return await this.provideVersionCompletions(packageName);
            }
        }

        // Check if we're in an ItemGroup Label attribute
        if (linePrefix.includes('<ItemGroup') && linePrefix.includes('Label="')) {
            return this.provideLabelCompletions();
        }

        // Provide snippet for full PackageVersion element
        if (linePrefix.trim().endsWith('<')) {
            return this.providePackageVersionSnippet();
        }

        return [];
    }

    private async providePackageNameCompletions(query: string): Promise<vscode.CompletionItem[]> {
        if (query.length < 2) {
            return [];
        }

        const searchResults = await this.nugetService.searchPackages(query, false, 10);

        return searchResults.map(result => {
            const item = new vscode.CompletionItem(result.id, vscode.CompletionItemKind.Module);
            item.detail = `v${result.version}`;
            item.documentation = new vscode.MarkdownString(
                `${result.description}\n\n---\n\nTotal Downloads: ${result.totalDownloads.toLocaleString()}`
            );
            item.sortText = `${1000000 - result.totalDownloads}`.padStart(10, '0') + result.id;
            item.insertText = result.id;
            return item;
        });
    }

    private async provideVersionCompletions(packageName: string): Promise<vscode.CompletionItem[]> {
        const versions = await this.nugetService.getPackageVersions(packageName);

        if (versions.length === 0) {
            return [];
        }

        const latestVersion = versions[versions.length - 1];
        const stableVersions = versions.filter(v => !v.includes('-'));
        const latestStable = stableVersions.length > 0 ? stableVersions[stableVersions.length - 1] : null;

        // Show latest 20 versions
        return versions.slice(-20).reverse().map((version, index) => {
            const item = new vscode.CompletionItem(version, vscode.CompletionItemKind.Value);

            if (version === latestVersion) {
                item.detail = 'Latest';
                item.sortText = '0_' + version;
            } else if (version === latestStable) {
                item.detail = 'Latest Stable';
                item.sortText = '1_' + version;
            } else {
                item.sortText = '2_' + (1000 - index).toString().padStart(4, '0');
            }

            item.insertText = version;
            return item;
        });
    }

    private provideLabelCompletions(): vscode.CompletionItem[] {
        const labels = this.cpmManager.getLabels();

        return labels.map(label => {
            const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.EnumMember);
            item.detail = 'Existing category';
            item.insertText = label;
            return item;
        });
    }

    private providePackageVersionSnippet(): vscode.CompletionItem[] {
        const snippet = new vscode.CompletionItem('PackageVersion', vscode.CompletionItemKind.Snippet);
        snippet.insertText = new vscode.SnippetString(
            'PackageVersion Include="${1:PackageName}" Version="${2:1.0.0}" />'
        );
        snippet.documentation = 'Insert a PackageVersion element';
        snippet.detail = 'PackageVersion snippet';
        return [snippet];
    }
}
