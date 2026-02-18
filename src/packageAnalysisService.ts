import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DotnetCliService, DotnetCliError, DotnetListOutput, DotnetListPackage, RestoreWarning } from './dotnetCliService';
import { CpmManager } from './cpmManager';
import { compareVersions } from './versionUtils';

export interface TransitiveConflict {
    packageId: string;
    centralVersion: string;
    transitiveVersion: string;
    transitiveParents: string[];
    projects: string[];
    framework: string;
}

export interface TransitiveConstraint {
    packageId: string;
    requiredVersion: string;
    versionRange: string;
    isExact: boolean;
    requiredBy: string[];
}

export interface VulnerablePackageInfo {
    packageId: string;
    resolvedVersion: string;
    isTransitive: boolean;
    vulnerabilities: Array<{
        severity: string;
        advisoryUrl: string;
    }>;
    projects: string[];
    framework: string;
}

export interface AnalysisResult {
    transitiveConflicts: TransitiveConflict[];
    vulnerablePackages: VulnerablePackageInfo[];
    lastUpdated: Date | null;
    isRunning: boolean;
    error: string | null;
}

export class PackageAnalysisService implements vscode.Disposable {
    private _analysisResult: AnalysisResult = {
        transitiveConflicts: [],
        vulnerablePackages: [],
        lastUpdated: null,
        isRunning: false,
        error: null
    };

    private _onDidChangeAnalysis = new vscode.EventEmitter<AnalysisResult>();
    public readonly onDidChangeAnalysis = this._onDidChangeAnalysis.event;

    private _transitiveConstraints: Map<string, TransitiveConstraint> = new Map();
    private _cacheTtlMs = 10 * 60 * 1000; // 10 minutes

    constructor(
        private dotnetCli: DotnetCliService,
        private cpmManager: CpmManager
    ) {}

    async runFullAnalysis(force: boolean = false): Promise<AnalysisResult> {
        // Return cached result if still valid
        if (
            !force &&
            this._analysisResult.lastUpdated &&
            Date.now() - this._analysisResult.lastUpdated.getTime() < this._cacheTtlMs
        ) {
            return this._analysisResult;
        }

        if (this._analysisResult.isRunning) {
            return this._analysisResult;
        }

        this._analysisResult.isRunning = true;
        this._analysisResult.error = null;
        this._onDidChangeAnalysis.fire(this._analysisResult);

        const fullStart = Date.now();
        try {
            const workspaceRoot = this.cpmManager.getWorkspaceRoot();
            if (!workspaceRoot) {
                throw new Error('No workspace root found');
            }

            const available = await this.dotnetCli.isDotnetAvailable();
            if (!available) {
                throw new DotnetCliError(
                    'dotnet CLI not found. Install the .NET SDK or set dotnetCpm.dotnetPath.',
                    'NOT_FOUND'
                );
            }

            const solutionPath = await this.cpmManager.getSolutionPath();

            // Run both analyses in parallel
            const [transitiveResult, vulnerableResult] = await Promise.allSettled([
                this.runTransitiveAnalysis(workspaceRoot, solutionPath),
                this.runVulnerabilityAnalysis(workspaceRoot, solutionPath)
            ]);

            this._analysisResult.transitiveConflicts =
                transitiveResult.status === 'fulfilled' ? transitiveResult.value : [];
            this._analysisResult.vulnerablePackages =
                vulnerableResult.status === 'fulfilled' ? vulnerableResult.value : [];

            // Collect errors from either analysis
            const errors: string[] = [];
            if (transitiveResult.status === 'rejected') {
                const err = transitiveResult.reason;
                if (!(err instanceof DotnetCliError && err.code === 'PARSE_ERROR')) {
                    errors.push(`Transitive analysis: ${err.message}`);
                }
            }
            if (vulnerableResult.status === 'rejected') {
                const err = vulnerableResult.reason;
                // --vulnerable may not be supported on older SDKs, treat as non-fatal
                console.warn('Vulnerability analysis failed:', err.message);
            }

            this._analysisResult.error = errors.length > 0 ? errors.join('; ') : null;
            this._analysisResult.lastUpdated = new Date();
        } catch (error) {
            this._analysisResult.error = error instanceof Error ? error.message : String(error);
        } finally {
            const constraintStart = Date.now();
            await this.extractConstraintsFromAssets().catch(err => {
                console.warn('Failed to extract transitive constraints from assets:', err);
            });
            console.log(`[Analysis] extractConstraintsFromAssets: ${Date.now() - constraintStart}ms`);
            this._analysisResult.isRunning = false;
            this._onDidChangeAnalysis.fire(this._analysisResult);
        }

        console.log(`[Analysis] Full analysis completed in ${Date.now() - fullStart}ms`);
        return this._analysisResult;
    }

    async runProjectAnalysis(projectPaths: string[]): Promise<AnalysisResult> {
        if (this._analysisResult.isRunning) {
            return this._analysisResult;
        }

        // If no prior full analysis exists, fall back to full analysis
        if (!this._analysisResult.lastUpdated) {
            return this.runFullAnalysis(true);
        }

        this._analysisResult.isRunning = true;
        this._analysisResult.error = null;
        this._onDidChangeAnalysis.fire(this._analysisResult);

        const projectStart = Date.now();
        const projectNames = projectPaths.map(
            p => p.split(/[\\/]/).pop()?.replace('.csproj', '') || p
        );
        console.log(`[Analysis] Per-project analysis starting for: ${projectNames.join(', ')}`);

        try {
            const workspaceRoot = this.cpmManager.getWorkspaceRoot();
            if (!workspaceRoot) {
                throw new Error('No workspace root found');
            }

            const available = await this.dotnetCli.isDotnetAvailable();
            if (!available) {
                throw new DotnetCliError(
                    'dotnet CLI not found. Install the .NET SDK or set dotnetCpm.dotnetPath.',
                    'NOT_FOUND'
                );
            }

            // Run transitive analysis per project in parallel
            // Skip vulnerability scan — NuGet API provides per-version vuln data in the panel,
            // and full analysis covers it comprehensively. This halves CLI commands per project.
            const allNewConflicts: TransitiveConflict[] = [];
            const errors: string[] = [];

            const projectResults = await Promise.allSettled(
                projectPaths.map(projectPath =>
                    this.runTransitiveAnalysis(workspaceRoot, projectPath)
                )
            );

            for (const result of projectResults) {
                if (result.status === 'fulfilled') {
                    allNewConflicts.push(...result.value);
                } else if (!(result.reason instanceof DotnetCliError &&
                             result.reason.code === 'PARSE_ERROR')) {
                    errors.push(`Transitive: ${result.reason.message}`);
                }
            }

            // Merge: remove old data for affected projects, add new data
            this._analysisResult.transitiveConflicts = this.mergeProjectConflicts(
                this._analysisResult.transitiveConflicts,
                allNewConflicts,
                projectNames
            );

            // Clear vulnerability data for affected projects (stale after version change);
            // will be refreshed on next full analysis or manual "Run Analysis"
            this._analysisResult.vulnerablePackages = this.mergeProjectVulnerabilities(
                this._analysisResult.vulnerablePackages,
                [], // no new vuln data — just remove stale entries
                projectNames
            );

            this._analysisResult.error = errors.length > 0 ? errors.join('; ') : null;
            this._analysisResult.lastUpdated = new Date();
        } catch (error) {
            this._analysisResult.error = error instanceof Error ? error.message : String(error);
        } finally {
            const constraintStart = Date.now();
            await this.extractConstraintsFromAssets().catch(err => {
                console.warn('Failed to extract transitive constraints from assets:', err);
            });
            console.log(`[Analysis] extractConstraintsFromAssets: ${Date.now() - constraintStart}ms`);
            this._analysisResult.isRunning = false;
            this._onDidChangeAnalysis.fire(this._analysisResult);
        }

        console.log(`[Analysis] Per-project analysis completed in ${Date.now() - projectStart}ms`);
        return this._analysisResult;
    }

    private mergeProjectConflicts(
        existing: TransitiveConflict[],
        newResults: TransitiveConflict[],
        affectedProjectNames: string[]
    ): TransitiveConflict[] {
        const affectedSet = new Set(affectedProjectNames.map(n => n.toLowerCase()));

        // Filter out affected projects from existing results
        const retained: TransitiveConflict[] = [];
        for (const conflict of existing) {
            const remainingProjects = conflict.projects.filter(
                p => !affectedSet.has(p.toLowerCase())
            );
            if (remainingProjects.length > 0) {
                retained.push({ ...conflict, projects: remainingProjects });
            }
        }

        // Union with new results
        for (const newConflict of newResults) {
            const match = retained.find(
                c => c.packageId.toLowerCase() === newConflict.packageId.toLowerCase()
                    && c.framework === newConflict.framework
            );
            if (match) {
                for (const proj of newConflict.projects) {
                    if (!match.projects.includes(proj)) {
                        match.projects.push(proj);
                    }
                }
            } else {
                retained.push(newConflict);
            }
        }

        return retained;
    }

    private mergeProjectVulnerabilities(
        existing: VulnerablePackageInfo[],
        newResults: VulnerablePackageInfo[],
        affectedProjectNames: string[]
    ): VulnerablePackageInfo[] {
        const affectedSet = new Set(affectedProjectNames.map(n => n.toLowerCase()));

        // Filter out affected projects from existing results
        const retained: VulnerablePackageInfo[] = [];
        for (const vuln of existing) {
            const remainingProjects = vuln.projects.filter(
                p => !affectedSet.has(p.toLowerCase())
            );
            if (remainingProjects.length > 0) {
                retained.push({ ...vuln, projects: remainingProjects });
            }
        }

        // Union with new results
        for (const newVuln of newResults) {
            const match = retained.find(
                v => v.packageId.toLowerCase() === newVuln.packageId.toLowerCase()
                    && v.resolvedVersion === newVuln.resolvedVersion
            );
            if (match) {
                for (const proj of newVuln.projects) {
                    if (!match.projects.includes(proj)) {
                        match.projects.push(proj);
                    }
                }
            } else {
                retained.push(newVuln);
            }
        }

        return retained;
    }

    private async runTransitiveAnalysis(
        workspaceRoot: string,
        solutionPath: string | null
    ): Promise<TransitiveConflict[]> {
        const target = solutionPath || 'workspace';
        const targetName = target.split(/[\\/]/).pop() || target;

        // Restore first to update project.assets.json, then list reads from it
        const restoreStart = Date.now();
        const warnings = await this.dotnetCli.restoreAndGetWarnings(workspaceRoot, solutionPath || undefined)
            .catch(() => [] as RestoreWarning[]);
        console.log(`[Analysis] dotnet restore (${targetName}): ${Date.now() - restoreStart}ms`);

        const listStart = Date.now();
        const output = await this.dotnetCli.listTransitivePackages(workspaceRoot, solutionPath || undefined);
        console.log(`[Analysis] dotnet list --include-transitive (${targetName}): ${Date.now() - listStart}ms`);

        const jsonConflicts = this.detectConflicts(output);
        const restoreConflicts = this.parseNu1608Warnings(warnings);

        // Merge: restore warnings are authoritative, add any JSON-detected ones not already covered
        return this.mergeConflicts(restoreConflicts, jsonConflicts);
    }

    private detectConflicts(output: DotnetListOutput): TransitiveConflict[] {
        const centralPackages = this.cpmManager.getAllPackages();
        const centralPackageMap = new Map(
            centralPackages.map(p => [p.name.toLowerCase(), p])
        );

        const conflicts: TransitiveConflict[] = [];
        const conflictKey = (pkgId: string, framework: string) =>
            `${pkgId.toLowerCase()}|${framework}`;
        const seen = new Set<string>();

        for (const project of output.projects || []) {
            const projectName = project.path.split(/[\\/]/).pop()?.replace('.csproj', '') || project.path;

            for (const framework of project.frameworks || []) {
                // Build a map of top-level package IDs for identifying parents
                const topLevelIds = new Set(
                    (framework.topLevelPackages || []).map(p => p.id.toLowerCase())
                );

                for (const transitivePackage of framework.transitivePackages || []) {
                    const centralPkg = centralPackageMap.get(transitivePackage.id.toLowerCase());

                    // Only flag when the central version is LOWER than the transitive
                    // resolved version. When central >= transitive, minimum constraints
                    // (>= X.Y.Z) are satisfied. Exact-constraint violations (e.g., = X.Y.Z)
                    // are caught authoritatively by NU1608 warnings from dotnet restore.
                    if (centralPkg &&
                        centralPkg.version !== transitivePackage.resolvedVersion &&
                        compareVersions(centralPkg.version, transitivePackage.resolvedVersion) < 0) {
                        const key = conflictKey(transitivePackage.id, framework.framework);

                        if (seen.has(key)) {
                            // Add project to existing conflict
                            const existing = conflicts.find(
                                c => c.packageId.toLowerCase() === transitivePackage.id.toLowerCase() &&
                                    c.framework === framework.framework
                            );
                            if (existing && !existing.projects.includes(projectName)) {
                                existing.projects.push(projectName);
                            }
                            continue;
                        }

                        seen.add(key);
                        conflicts.push({
                            packageId: centralPkg.name,
                            centralVersion: centralPkg.version,
                            transitiveVersion: transitivePackage.resolvedVersion,
                            transitiveParents: Array.from(topLevelIds)
                                .filter(id => !centralPackageMap.has(id) || id !== transitivePackage.id.toLowerCase())
                                .slice(0, 5), // Limit parent list
                            projects: [projectName],
                            framework: framework.framework
                        });
                    }
                }
            }
        }

        return conflicts;
    }

    private parseNu1608Warnings(warnings: RestoreWarning[]): TransitiveConflict[] {
        const conflicts: TransitiveConflict[] = [];
        const seen = new Set<string>();

        // NU1608 message format:
        // "Detected package version outside of dependency constraint: Humanizer.Core.af 2.14.1 requires Humanizer.Core (= 2.14.1) but version Humanizer.Core 3.0.1 was resolved."
        const nu1608Regex = /(\S+)\s+\S+\s+requires\s+(\S+)\s+\([^)]*?(\d[\d.]*\S*)\)\s+but version\s+\S+\s+(\S+)\s+was resolved/;

        for (const warning of warnings) {
            if (warning.code !== 'NU1608') {
                continue;
            }

            const match = nu1608Regex.exec(warning.message);
            if (!match) {
                continue;
            }

            const constrainer = match[1];     // e.g. "Humanizer.Core.af"
            const packageId = match[2];        // e.g. "Humanizer.Core"
            const requiredVersion = match[3];  // e.g. "2.14.1"
            const resolvedVersion = match[4];  // e.g. "3.0.1"

            const projectName = warning.project.split(/[\\/]/).pop()?.replace('.csproj', '') || warning.project;
            const key = packageId.toLowerCase();

            if (seen.has(key)) {
                // Add constrainer/project to existing conflict
                const existing = conflicts.find(c => c.packageId.toLowerCase() === key);
                if (existing) {
                    if (!existing.transitiveParents.includes(constrainer)) {
                        existing.transitiveParents.push(constrainer);
                    }
                    if (!existing.projects.includes(projectName)) {
                        existing.projects.push(projectName);
                    }
                }
                continue;
            }

            seen.add(key);
            conflicts.push({
                packageId: packageId,
                centralVersion: resolvedVersion,
                transitiveVersion: requiredVersion,
                transitiveParents: [constrainer],
                projects: [projectName],
                framework: ''
            });
        }

        // Limit transitiveParents to avoid noise (e.g., 50+ Humanizer satellite packages)
        for (const conflict of conflicts) {
            if (conflict.transitiveParents.length > 5) {
                const count = conflict.transitiveParents.length;
                conflict.transitiveParents = [
                    ...conflict.transitiveParents.slice(0, 3),
                    `and ${count - 3} more`
                ];
            }
        }

        return conflicts;
    }

    private mergeConflicts(primary: TransitiveConflict[], secondary: TransitiveConflict[]): TransitiveConflict[] {
        const result = [...primary];
        const seen = new Set(primary.map(c => c.packageId.toLowerCase()));

        for (const conflict of secondary) {
            if (!seen.has(conflict.packageId.toLowerCase())) {
                result.push(conflict);
                seen.add(conflict.packageId.toLowerCase());
            }
        }

        return result;
    }

    private async runVulnerabilityAnalysis(
        workspaceRoot: string,
        solutionPath: string | null
    ): Promise<VulnerablePackageInfo[]> {
        const target = solutionPath || 'workspace';
        const targetName = target.split(/[\\/]/).pop() || target;

        const vulnStart = Date.now();
        const output = await this.dotnetCli.listVulnerablePackages(
            workspaceRoot,
            solutionPath || undefined
        );
        console.log(`[Analysis] dotnet list --vulnerable (${targetName}): ${Date.now() - vulnStart}ms`);
        return this.extractVulnerabilities(output);
    }

    private extractVulnerabilities(output: DotnetListOutput): VulnerablePackageInfo[] {
        const vulns: VulnerablePackageInfo[] = [];
        const vulnKey = (pkgId: string, version: string) =>
            `${pkgId.toLowerCase()}|${version}`;
        const seen = new Set<string>();

        for (const project of output.projects || []) {
            const projectName = project.path.split(/[\\/]/).pop()?.replace('.csproj', '') || project.path;

            for (const framework of project.frameworks || []) {
                const processPackages = (packages: DotnetListPackage[] | undefined, isTransitive: boolean) => {
                    for (const pkg of packages || []) {
                        if (!pkg.vulnerabilities || pkg.vulnerabilities.length === 0) {
                            continue;
                        }

                        const key = vulnKey(pkg.id, pkg.resolvedVersion);
                        if (seen.has(key)) {
                            const existing = vulns.find(
                                v => v.packageId.toLowerCase() === pkg.id.toLowerCase() &&
                                    v.resolvedVersion === pkg.resolvedVersion
                            );
                            if (existing && !existing.projects.includes(projectName)) {
                                existing.projects.push(projectName);
                            }
                            continue;
                        }

                        seen.add(key);
                        vulns.push({
                            packageId: pkg.id,
                            resolvedVersion: pkg.resolvedVersion,
                            isTransitive,
                            vulnerabilities: pkg.vulnerabilities.map(v => ({
                                severity: v.severity,
                                advisoryUrl: v.advisoryurl
                            })),
                            projects: [projectName],
                            framework: framework.framework
                        });
                    }
                };

                processPackages(framework.topLevelPackages, false);
                processPackages(framework.transitivePackages, true);
            }
        }

        return vulns;
    }

    getAnalysisResult(): AnalysisResult {
        return this._analysisResult;
    }

    getConflictsForPackage(packageName: string): TransitiveConflict[] {
        return this._analysisResult.transitiveConflicts.filter(
            c => c.packageId.toLowerCase() === packageName.toLowerCase()
        );
    }

    getVulnerabilitiesForPackage(packageName: string): VulnerablePackageInfo[] {
        return this._analysisResult.vulnerablePackages.filter(
            v => v.packageId.toLowerCase() === packageName.toLowerCase()
        );
    }

    getConstraintsForPackage(packageName: string): TransitiveConstraint | undefined {
        return this._transitiveConstraints.get(packageName.toLowerCase());
    }

    private async extractConstraintsFromAssets(): Promise<void> {
        this._transitiveConstraints.clear();
        const centralPackages = this.cpmManager.getAllPackages();
        const centralPackageNames = new Set(centralPackages.map(p => p.name.toLowerCase()));
        const projects = this.cpmManager.getAllProjects();

        // Read all project.assets.json files in parallel (async I/O)
        const assetResults = await Promise.all(
            projects.map(async (project) => {
                try {
                    const projectDir = path.dirname(project.path);
                    const assetsPath = path.join(projectDir, 'obj', 'project.assets.json');
                    const content = await fs.promises.readFile(assetsPath, 'utf-8');
                    return JSON.parse(content);
                } catch {
                    return null; // Assets file may not exist or be unparseable
                }
            })
        );

        // Process parsed assets (CPU-only, no I/O)
        for (const assets of assetResults) {
            if (!assets) { continue; }

            for (const packages of Object.values(assets.targets || {}) as any[]) {
                for (const [pkgKey, pkgInfo] of Object.entries(packages as Record<string, any>)) {
                    const deps: Record<string, string> = pkgInfo.dependencies || {};
                    const parentPkg = pkgKey.split('/')[0];

                    for (const [depName, depVersionRange] of Object.entries(deps)) {
                        if (!centralPackageNames.has(depName.toLowerCase())) {
                            continue;
                        }
                        if (parentPkg.toLowerCase() === depName.toLowerCase()) {
                            continue;
                        }

                        const range = String(depVersionRange);
                        const parsed = this.parseVersionRange(range);
                        const key = depName.toLowerCase();
                        const existing = this._transitiveConstraints.get(key);

                        if (existing) {
                            if (!existing.requiredBy.includes(parentPkg)) {
                                existing.requiredBy.push(parentPkg);
                            }
                            // Prefer exact constraints over minimum constraints
                            if (parsed.isExact && !existing.isExact) {
                                existing.requiredVersion = parsed.version;
                                existing.versionRange = range;
                                existing.isExact = true;
                            }
                        } else {
                            this._transitiveConstraints.set(key, {
                                packageId: depName,
                                requiredVersion: parsed.version,
                                versionRange: range,
                                isExact: parsed.isExact,
                                requiredBy: [parentPkg]
                            });
                        }
                    }
                }
            }
        }

        // Limit requiredBy lists to avoid noise
        for (const constraint of this._transitiveConstraints.values()) {
            if (constraint.requiredBy.length > 5) {
                const count = constraint.requiredBy.length;
                constraint.requiredBy = [
                    ...constraint.requiredBy.slice(0, 3),
                    `and ${count - 3} more`
                ];
            }
        }
    }

    private parseVersionRange(range: string): { version: string; isExact: boolean } {
        // NuGet version range formats:
        // "[2.14.1]"        → exact version
        // "[2.14.1, 2.14.1]" → exact version
        // "2.14.1"          → minimum version (>= 2.14.1)
        // "[2.0.0, 3.0.0)"  → range
        const trimmed = range.trim();

        // Exact: [X.Y.Z] or [X.Y.Z, X.Y.Z]
        const exactMatch = trimmed.match(/^\[([^\],]+)\]$/);
        if (exactMatch) {
            return { version: exactMatch[1].trim(), isExact: true };
        }
        const exactRangeMatch = trimmed.match(/^\[([^\],]+),\s*([^\]]+)\]$/);
        if (exactRangeMatch && exactRangeMatch[1].trim() === exactRangeMatch[2].trim()) {
            return { version: exactRangeMatch[1].trim(), isExact: true };
        }

        // Everything else: extract the version number as a minimum
        const versionMatch = trimmed.match(/[\[(]?\s*(\d[\d.]*[^\s,)\]]*)/);
        return { version: versionMatch ? versionMatch[1] : trimmed, isExact: false };
    }

    clearCache(): void {
        this._analysisResult = {
            transitiveConflicts: [],
            vulnerablePackages: [],
            lastUpdated: null,
            isRunning: false,
            error: null
        };
        this._transitiveConstraints.clear();
        this._onDidChangeAnalysis.fire(this._analysisResult);
    }

    dispose(): void {
        this._onDidChangeAnalysis.dispose();
    }
}
