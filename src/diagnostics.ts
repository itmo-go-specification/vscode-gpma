import * as vscode from 'vscode';

export interface GpmaPosition {
  line: number;
  character: number;
}

export interface GpmaRange {
  start: GpmaPosition;
  end: GpmaPosition;
}

export interface GpmaDiagnostic {
  message: string;
  range: GpmaRange;
  severity: number;
  source?: string;
  code?: string | number;
}

export interface GpmaDiagnosticsOutput {
  diagnostics: GpmaDiagnostic[];
}

export function mapSeverity(severity: number): vscode.DiagnosticSeverity {
  // GPMA returns 0=Error, 1=Warning, 2=Info which matches VS Code DiagnosticSeverity enum
  return severity as vscode.DiagnosticSeverity;
}

export function parseGpmaDiagnostics(jsonOutput: string): GpmaDiagnostic[] {
  try {
    const output: GpmaDiagnosticsOutput = JSON.parse(jsonOutput);
    return output.diagnostics || [];
  } catch (error) {
    console.error('Failed to parse GPMA diagnostics JSON:', error);
    return [];
  }
}

export function toVscodeDiagnostics(gpmaDiagnostics: GpmaDiagnostic[]): vscode.Diagnostic[] {
  return gpmaDiagnostics.map(d => {
    const range = new vscode.Range(
      new vscode.Position(d.range.start.line, d.range.start.character),
      new vscode.Position(d.range.end.line, d.range.end.character)
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      d.message,
      mapSeverity(d.severity)
    );

    diagnostic.source = d.source ?? 'gpma';
    
    if (d.code !== undefined) {
      diagnostic.code = d.code;
    }

    return diagnostic;
  });
}
