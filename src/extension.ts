import * as vscode from 'vscode';
import { getGpmaConfig } from './config';
import { runGpma } from './gpmaRunner';
import { toVscodeDiagnostics } from './diagnostics';

// Debounce timer for verify on save
let verifyTimeout: NodeJS.Timeout | undefined;
let isVerifying = false;
let currentCancellationTokenSource: vscode.CancellationTokenSource | undefined;

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

	// Register document save event listener for verify on save
	const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
		const config = getGpmaConfig();
		
		console.log(`[GPMA] Document saved: ${document.uri.fsPath}, language: ${document.languageId}`);
		console.log(`[GPMA] Verify on save enabled: ${config.staticVerifyOnSave}`);
		
		if (!config.staticVerifyOnSave) {
			return;
		}

		const supportedLanguages = ['go', 'go-acsl', 'acsl'];
		if (!supportedLanguages.includes(document.languageId)) {
			console.log(`[GPMA] Language ${document.languageId} not supported for auto-verify`);
			return;
		}

		// Cancel current verification if running
		if (isVerifying && currentCancellationTokenSource) {
			console.log('[GPMA] Cancelling current verification');
			currentCancellationTokenSource.cancel();
		}

		// Clear existing timeout to prevent queued verifications
		if (verifyTimeout) {
			console.log('[GPMA] Clearing existing debounce timeout');
			clearTimeout(verifyTimeout);
			verifyTimeout = undefined;
		}

		// Schedule verification immediately after debounce
		console.log(`[GPMA] Scheduling verification in ${config.staticVerifyOnSaveDebounce}ms`);
		
		verifyTimeout = setTimeout(async () => {
			console.log('[GPMA] Running auto-verification');
			verifyTimeout = undefined;
			await verifyDocument(document, output, diagnostics);
		}, config.staticVerifyOnSaveDebounce);
	});

	context.subscriptions.push(saveListener);
}

async function verifyWithProgress(
	document: vscode.TextDocument,
	output: vscode.OutputChannel,
	diagnosticCollection: vscode.DiagnosticCollection,
	showNotifications: boolean = true,
	isAutoVerify: boolean = false,
	cancellationToken?: vscode.CancellationToken
): Promise<void> {
	if (document.uri.scheme !== 'file') {
		return;
	}

	// Clear existing diagnostics for this file
	diagnosticCollection.set(document.uri, []);

	const prefix = isAutoVerify ? '[GPMA] Auto-verify on save' : '[GPMA] Verify current file';
	output.appendLine(prefix);
	output.appendLine(`[GPMA] File: ${document.uri.fsPath}`);

	// Create cancellation token for this verification
	const tokenSource = new vscode.CancellationTokenSource();
	
	// Store reference for external cancellation
	if (isAutoVerify) {
		currentCancellationTokenSource = tokenSource;
	}

	try {
		isVerifying = true;
		
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'GPMA: Verifying current file...',
				cancellable: true
			},
			async (progress, progressToken) => {
				// Listen for external cancellation
				if (cancellationToken) {
					const disposable = cancellationToken.onCancellationRequested(() => {
						console.log('[GPMA] External cancellation requested');
						tokenSource.cancel();
					});
					
					// Clean up listener when done
					progressToken.onCancellationRequested(() => {
						disposable.dispose();
					});
				}

				// Use the token source's token for cancellation
				const result = await runGpma(document.uri.fsPath, output, tokenSource.token);

				// Convert and set diagnostics
				const vscodeDiagnostics = toVscodeDiagnostics(result.diagnostics);
				diagnosticCollection.set(document.uri, vscodeDiagnostics);

				// Show notification only if requested
				if (showNotifications) {
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
			}
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		// Check if it was a cancellation
		if (errorMessage === 'Verification cancelled') {
			if (showNotifications) {
				vscode.window.showInformationMessage('GPMA: Verification cancelled.');
			}
			return;
		}
		
		output.appendLine(`[GPMA] Error: ${errorMessage}`);
		
		if (showNotifications) {
			vscode.window.showErrorMessage(
				'GPMA: Failed to run verifier. See GPMA output for details.'
			);
		}
	} finally {
		isVerifying = false;
		if (isAutoVerify) {
			currentCancellationTokenSource = undefined;
		}
		tokenSource.dispose();
	}
}

async function verifyDocument(
	document: vscode.TextDocument,
	output: vscode.OutputChannel,
	diagnosticCollection: vscode.DiagnosticCollection,
	showNotifications: boolean = true
): Promise<void> {
	await verifyWithProgress(document, output, diagnosticCollection, showNotifications, true);
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

	output.clear();
	output.show(true);

	await verifyWithProgress(document, output, diagnosticCollection, true, false);
}

export function deactivate() {}
