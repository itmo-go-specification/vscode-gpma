import * as vscode from 'vscode';

export interface GpmaConfig {
  command: string;
  staticPlugin: string;
  staticPluginConfig: string;
  staticExtraArgs: string[];
  staticSaveBeforeVerify: boolean;
  staticVerifyOnSave: boolean;
  staticVerifyOnSaveDebounce: number;
}

export function getGpmaConfig(): GpmaConfig {
  const config = vscode.workspace.getConfiguration('gpma');
  
  return {
    command: config.get<string>('command', 'gpma'),
    staticPlugin: config.get<string>('static.plugin', 'gobra'),
    staticPluginConfig: config.get<string>('static.pluginConfig', 'gobra:backend:docker'),
    staticExtraArgs: config.get<string[]>('static.extraArgs', []),
    staticSaveBeforeVerify: config.get<boolean>('static.saveBeforeVerify', true),
    staticVerifyOnSave: config.get<boolean>('static.verifyOnSave', false),
    staticVerifyOnSaveDebounce: config.get<number>('static.verifyOnSaveDebounce', 1000)
  };
}
