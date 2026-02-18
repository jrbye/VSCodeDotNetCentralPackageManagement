import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

// Interfaces modeling the JSON output from `dotnet list package --format json`
export interface DotnetListOutput {
    version: number;
    parameters: string;
    sources?: string[];
    projects: DotnetListProject[];
}

export interface DotnetListProject {
    path: string;
    frameworks: DotnetListFramework[];
}

export interface DotnetListFramework {
    framework: string;
    topLevelPackages?: DotnetListPackage[];
    transitivePackages?: DotnetListPackage[];
}

export interface DotnetListPackage {
    id: string;
    requestedVersion?: string;
    resolvedVersion: string;
    latestVersion?: string;
    deprecationReasons?: string[];
    alternativePackage?: {
        id: string;
        versionRange: string;
    };
    vulnerabilities?: DotnetVulnerability[];
}

export interface DotnetVulnerability {
    severity: string;   // "Low" | "Moderate" | "High" | "Critical"
    advisoryurl: string;
}

export interface RestoreWarning {
    code: string;         // e.g. "NU1608"
    message: string;      // full warning text
    project: string;      // project path from the warning line
}

export class DotnetCliError extends Error {
    constructor(
        message: string,
        public readonly code: 'NOT_FOUND' | 'TIMEOUT' | 'PARSE_ERROR' | 'COMMAND_FAILED'
    ) {
        super(message);
        this.name = 'DotnetCliError';
    }
}

export class DotnetCliService implements vscode.Disposable {
    private runningProcesses: cp.ChildProcess[] = [];

    private getDotnetPath(): string {
        const configured = vscode.workspace.getConfiguration('dotnetCpm').get<string>('dotnetPath', '');
        return configured || 'dotnet';
    }

    async isDotnetAvailable(): Promise<boolean> {
        try {
            await this.runCommand(['--version'], undefined, 10000);
            return true;
        } catch {
            return false;
        }
    }

    async listTransitivePackages(cwd: string, projectOrSolutionPath?: string): Promise<DotnetListOutput> {
        const args = ['list'];
        if (projectOrSolutionPath) {
            args.push(projectOrSolutionPath);
        }
        args.push('package', '--include-transitive', '--format', 'json');

        const output = await this.runCommand(args, cwd);
        return this.parseJsonOutput(output);
    }

    async listVulnerablePackages(cwd: string, projectOrSolutionPath?: string): Promise<DotnetListOutput> {
        const args = ['list'];
        if (projectOrSolutionPath) {
            args.push(projectOrSolutionPath);
        }
        args.push('package', '--vulnerable', '--include-transitive', '--format', 'json');

        const output = await this.runCommand(args, cwd);
        return this.parseJsonOutput(output);
    }

    async restoreAndGetWarnings(cwd: string, projectOrSolutionPath?: string): Promise<RestoreWarning[]> {
        const args = ['restore'];
        if (projectOrSolutionPath) {
            args.push(projectOrSolutionPath);
        }

        const { stdout, stderr } = await this.runCommandFull(args, cwd);
        const combined = stdout + '\n' + stderr;
        const warnings: RestoreWarning[] = [];
        const warningRegex = /([^:\r\n]*?)\s*:\s*warning\s+(NU\d+)\s*:\s*(.+)/g;
        let match;

        while ((match = warningRegex.exec(combined)) !== null) {
            warnings.push({
                project: match[1].trim(),
                code: match[2],
                message: match[3].trim()
            });
        }

        return warnings;
    }

    private parseJsonOutput(output: string): DotnetListOutput {
        try {
            // The dotnet CLI may output warnings/info before the JSON. Find the JSON start.
            const jsonStart = output.indexOf('{');
            if (jsonStart === -1) {
                throw new DotnetCliError(
                    'No JSON output from dotnet CLI. Ensure you have .NET SDK 7.0.200 or later.',
                    'PARSE_ERROR'
                );
            }
            return JSON.parse(output.substring(jsonStart));
        } catch (error) {
            if (error instanceof DotnetCliError) {
                throw error;
            }
            throw new DotnetCliError(
                `Failed to parse dotnet CLI JSON output: ${error instanceof Error ? error.message : error}`,
                'PARSE_ERROR'
            );
        }
    }

    private runCommandFull(args: string[], cwd?: string, timeoutMs: number = 120000): Promise<{stdout: string, stderr: string}> {
        return new Promise((resolve, reject) => {
            const dotnetPath = this.getDotnetPath();

            const proc = cp.execFile(
                dotnetPath,
                args,
                {
                    cwd: cwd,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: timeoutMs,
                    windowsHide: true
                },
                (error, stdout, stderr) => {
                    const idx = this.runningProcesses.indexOf(proc);
                    if (idx !== -1) {
                        this.runningProcesses.splice(idx, 1);
                    }

                    if (error) {
                        if ((error as any).killed || error.message?.includes('ETIMEDOUT')) {
                            reject(new DotnetCliError(
                                `dotnet command timed out after ${timeoutMs / 1000}s`,
                                'TIMEOUT'
                            ));
                            return;
                        }
                        if (error.message?.includes('ENOENT') || error.message?.includes('not found')) {
                            reject(new DotnetCliError(
                                'dotnet CLI not found. Install the .NET SDK or set dotnetCpm.dotnetPath.',
                                'NOT_FOUND'
                            ));
                            return;
                        }
                    }

                    // For restore, we want stdout+stderr even on non-zero exit
                    resolve({ stdout: stdout || '', stderr: stderr || '' });
                }
            );

            this.runningProcesses.push(proc);
        });
    }

    private runCommand(args: string[], cwd?: string, timeoutMs: number = 120000): Promise<string> {
        return new Promise((resolve, reject) => {
            const dotnetPath = this.getDotnetPath();

            const proc = cp.execFile(
                dotnetPath,
                args,
                {
                    cwd: cwd,
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: timeoutMs,
                    windowsHide: true
                },
                (error, stdout, stderr) => {
                    // Remove from tracking
                    const idx = this.runningProcesses.indexOf(proc);
                    if (idx !== -1) {
                        this.runningProcesses.splice(idx, 1);
                    }

                    if (error) {
                        if ((error as any).killed || error.message?.includes('ETIMEDOUT')) {
                            reject(new DotnetCliError(
                                `dotnet command timed out after ${timeoutMs / 1000}s`,
                                'TIMEOUT'
                            ));
                            return;
                        }
                        if (error.message?.includes('ENOENT') || error.message?.includes('not found')) {
                            reject(new DotnetCliError(
                                'dotnet CLI not found. Install the .NET SDK or set dotnetCpm.dotnetPath.',
                                'NOT_FOUND'
                            ));
                            return;
                        }
                        // Some dotnet commands return non-zero exit but still produce valid JSON on stdout
                        // (e.g., --vulnerable when vulnerabilities are found)
                        if (stdout && stdout.includes('{')) {
                            resolve(stdout);
                            return;
                        }
                        reject(new DotnetCliError(
                            `dotnet command failed: ${stderr || error.message}`,
                            'COMMAND_FAILED'
                        ));
                        return;
                    }

                    resolve(stdout);
                }
            );

            this.runningProcesses.push(proc);
        });
    }

    dispose(): void {
        for (const proc of this.runningProcesses) {
            try {
                proc.kill();
            } catch {
                // ignore
            }
        }
        this.runningProcesses = [];
    }
}
