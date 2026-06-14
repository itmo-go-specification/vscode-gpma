import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import { getGpmaConfig } from './config';
import { parseGpmaDiagnostics, GpmaDiagnostic } from './diagnostics';

export interface GpmaRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  diagnostics: GpmaDiagnostic[];
}

export function shellQuote(arg: string): string {
  if (process.platform === 'win32') {
    // Simple quoting for Windows - use double quotes and escape existing quotes
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  // Unix-style single quote escaping
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function runGpma(
  filePath: string,
  output: vscode.OutputChannel,
  cancellationToken?: vscode.CancellationToken
): Promise<GpmaRunResult> {
  const config = getGpmaConfig();
  
  // Get workspace folder for cwd
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  const cwd = workspaceFolder?.uri.fsPath ?? path.dirname(filePath);
  
  // Build command arguments
  const args = [
    'file',
    '--plugin', config.staticPlugin,
    '--plugin-config', config.staticPluginConfig,
    '--error-format', 'vscode',
    '--error-output', 'stderr',
    ...config.staticExtraArgs,
    filePath
  ];
  
  // Construct shell command
  const command = `${config.command} ${args.map(shellQuote).join(' ')}`;
  
  output.appendLine(`[GPMA] Command: ${command}`);
  output.appendLine(`[GPMA] CWD: ${cwd}`);
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // Use spawn instead of exec for better process control
    const proc = child_process.spawn(command, {
      cwd,
      shell: true
    }) as child_process.ChildProcess;
    
    let stdout = '';
    let stderr = '';
    
    if (proc.stdout) {
      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }
    
    if (proc.stderr) {
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }
    
    // Handle cancellation
    if (cancellationToken) {
      const cancellationDisposable = cancellationToken.onCancellationRequested(() => {
        output.appendLine('[GPMA] Verification cancelled by user');
        proc.kill('SIGTERM');
        reject(new Error('Verification cancelled'));
      });
      
      proc.on('exit', () => {
        cancellationDisposable.dispose();
      });
    }
    
    proc.on('error', (error: Error) => {
      const duration = Date.now() - startTime;
      output.appendLine(`[GPMA] Error: ${error.message}`);
      output.appendLine(`[GPMA] Duration: ${duration}ms`);
      reject(error);
    });
    
    proc.on('exit', (code: number | null, signal: string | null) => {
      const duration = Date.now() - startTime;
      
      if (signal === 'SIGTERM') {
        // Process was killed by cancellation
        return;
      }
      
      output.appendLine(`[GPMA] Exit code: ${code ?? 0}`);
      output.appendLine(`[GPMA] Duration: ${duration}ms`);
      
      if (stdout) {
        output.appendLine(`[GPMA] Stdout:\n${stdout}`);
      }
      
      if (stderr) {
        output.appendLine(`[GPMA] Stderr:\n${stderr}`);
      }
      
      // Parse diagnostics from stderr
      const diagnostics = parseGpmaDiagnostics(stderr);
      output.appendLine(`[GPMA] Diagnostics found: ${diagnostics.length}`);
      
      resolve({
        exitCode: code,
        stdout,
        stderr,
        diagnostics
      });
    });
  });
}
