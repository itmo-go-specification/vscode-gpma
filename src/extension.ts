import * as vscode from 'vscode';
import { getGpmaConfig } from './config';
import { runGpma } from './gpmaRunner';
import { toVscodeDiagnostics } from './diagnostics';

export function activate(context: vscode.ExtensionContext) {
	console.log('GPMA extension is now active!');

	// Create output channel and diagnostic collection
	const output = vscode.window.createOutputChannel('GPMA');
	const diagnostics = vscode.languages.createDiagnosticCollection('gpma');

	context.subscriptions.push(output, diagnostics);

	// Register verify current file command
	const verifyCommand = vscode.commands.registerCommand('gpma.verifyCurrentFile', async () => {
		await verifyCurrentFile(output, diagnostics);
	});

	context.subscriptions.push(verifyCommand);
}

async function verifyCurrentFile(
	output: vscode.OutputChannel,
	diagnosticCollection: vscode.DiagnosticCollection
): Promise<void> {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		vscode.window.showWarningMessage('GPMA: No active editor.');
		return;
	}

	const document = editor.document;

	if (document.uri.scheme !== 'file') {
		vscode.window.showWarningMessage('GPMA: Current document is not a file.');
		return;
	}

	const config = getGpmaConfig();
	const supportedLanguages = ['go', 'go-acsl', 'acsl'];

	if (!supportedLanguages.includes(document.languageId)) {
		const answer = await vscode.window.showWarningMessage(
			`GPMA: Current file is not a Go/GPMA file (language: ${document.languageId}). Verify anyway?`,
			'Verify'
		);
		if (answer !== 'Verify') {
			return;
		}
	}

	// Save file if dirty and configured to do so
	if (config.staticSaveBeforeVerify && document.isDirty) {
		const saved = await document.save();
		if (!saved) {
			vscode.window.showWarningMessage('GPMA: File was not saved.');
			return;
		}
	}

	// Clear existing diagnostics for this file
	diagnosticCollection.set(document.uri, []);

	output.clear();
	output.appendLine('[GPMA] Verify current file');
	output.appendLine(`[GPMA] File: ${document.uri.fsPath}`);
	output.show(true);

	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'GPMA: Verifying current file...',
				cancellable: true
			},
			async (progress, token) => {
				const result = await runGpma(document.uri.fsPath, output, token);

				// Convert and set diagnostics
				const vscodeDiagnostics = toVscodeDiagnostics(result.diagnostics);
				diagnosticCollection.set(document.uri, vscodeDiagnostics);

				// Show notification
				if (result.exitCode === 0 && vscodeDiagnostics.length === 0) {
					vscode.window.showInformationMessage('GPMA: Verification completed successfully, 0 diagnostics.');
				} else if (vscodeDiagnostics.length > 0) {
					vscode.window.showWarningMessage(
						`GPMA: Verification completed, ${vscodeDiagnostics.length} diagnostic(s) found.`
					);
				} else {
					vscode.window.showErrorMessage(
						'GPMA: Verification failed. See GPMA output for details.'
					);
				}
			}
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		// Check if it was a cancellation
		if (errorMessage === 'Verification cancelled') {
			vscode.window.showInformationMessage('GPMA: Verification cancelled.');
			return;
		}
		
		output.appendLine(`[GPMA] Error: ${errorMessage}`);
		vscode.window.showErrorMessage(
			'GPMA: Failed to run verifier. See GPMA output for details.'
		);
	}
}

export function deactivate() {}
