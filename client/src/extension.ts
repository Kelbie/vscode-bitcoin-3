/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { languages, commands, workspace, ExtensionContext, window, Uri, TextDocument, Hover, TextDocumentContentProvider, EventEmitter, OverviewRulerLane, DecorationOptions, Range, TextEditor, Position, WorkspaceEdit, ViewColumn, WebviewPanel, Disposable, Webview, SnippetString, CodeLensProvider, CodeLens, Command } from 'vscode';

import async from "async";
import { parse } from 'node-html-parser';

// import bitcoin from "bitcoinjs-lib";
// const Client = require('bitcoin-core');
// const bitcoinClient = new Client({ username:"user", password: "pass", network: 'mainnet' });
const opcodes = require("./op_codes");

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from 'vscode-languageclient';

import { alert } from "./alert";
import { worker } from 'cluster';
import { exec } from 'child_process';

const { spawn } = require('child_process');

const miniscript = require("../miniscript/miniscript.js");

let client: LanguageClient;

let editor = window.activeTextEditor;

const smallNumberDecorationType = window.createTextEditorDecorationType({
	overviewRulerLane: OverviewRulerLane.Right,
	isWholeLine: true,
	gutterIconSize: 'contain',
	light: {
		// this color will be used in light color themes
		borderColor: 'darkblue'
	},
	dark: {
		// this color will be used in dark color themes
		borderColor: 'lightblue'
	}
});

// test miniscript stuff
function execute(script) {

	console.log(`execute("${script}")`)
	let em_miniscript_compile = miniscript.cwrap('miniscript_compile', 'none', ['string', 'number', 'number', 'number', 'number', 'number', 'number']);
	let msout = miniscript._malloc(10000);
	let costout = miniscript._malloc(500);
	let asmout = miniscript._malloc(100000);
	em_miniscript_compile(script, msout, 10000, costout, 500, asmout, 100000);
	alert(miniscript.UTF8ToString(asmout));
	alert(miniscript.UTF8ToString(costout));
	alert(miniscript.UTF8ToString(msout));

	try {
		const root = parse(miniscript.UTF8ToString(costout));
	
		let costout_json = {
			script: root.childNodes[0].childNodes[0].rawText.split(":")[1].trim(),
			input: root.childNodes[0].childNodes[1].rawText.split(":")[1].trim(),
			total: root.childNodes[0].childNodes[2].rawText.split(":")[1].trim()
		}
		return {
			error: false,
			costout: costout_json,
			msout: miniscript.UTF8ToString(msout),
			asmout: miniscript.UTF8ToString(asmout),
		};
	} catch(err) {
		return {
			error: true,
			msout: miniscript.UTF8ToString(msout),
			asmout: miniscript.UTF8ToString(asmout),
			costout: {
				script: "",
				input: "",
				total: ""
			}
		}
	}
}

function updateDecorations() {
	// let { document } = window.activeTextEditor;
	// const text = document.getText().replace(/\s/g, '');
	// const compiled = execute(text);
	// console.log(234);
	// const decoration = { 
	// 	range: new Range(0, 0, 0, 0),
	// 	renderOptions: {
	// 		after: {
	// 			fontStyle: "italic",
	// 			color: "gray",
	// 			contentText: !compiled.error ? `\tScript: ${compiled.costout.script} | Input: ${compiled.costout.input} | Total: ${compiled.costout.total}` : "\t[Compiler Error]"
	// 		} 
	// 	}
	// };
	
	// window.activeTextEditor.setDecorations(smallNumberDecorationType, [decoration]);
}

function scriptToHex() {
	// let { document } = window.activeTextEditor;
	// const text = document.getText();
	// exec(`node /Users/kevinkelbie/Desktop/Documents/GitHub/vscode-bitcoin/client/btcdeb/btcc.js ${text.replace("\n", " ").trim()}`, (err, stdout, stderr) => {

	// 	const decoration = { 
	// 		range: new Range(0, 0, 0, 0),
	// 		renderOptions: {
	// 			after: {
	// 				fontStyle: "italic",
	// 				color: "gray",
	// 				contentText: `\tHex: ${stdout}`
	// 			} 
	// 		}
	// 	};

	// 	window.activeTextEditor.setDecorations(smallNumberDecorationType, [decoration]);
	// });

}

let timeout: NodeJS.Timer | undefined = undefined;
function triggerUpdateDecorations(update) {
	if (timeout) {
		clearTimeout(timeout);
		timeout = undefined;
	}
	timeout = setTimeout(update, 100);
}

function getWebviewContent() {
	return `
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Cat Coding</title>
			</head>
			<body>
				<fieldset>
					<legend>Contract Arguments</legend>
					<label>key_revocation: PublicKey</label>
					<input type="text" name="key_revocation" class="PublicKey" value="0334e0cea784897976f34ac4b13193056a12242c11af17b05a4d865e380271de7b" />
				</fieldset>
				<label></label>
			</body>
		</html>`;
}

class MyCodeLensProvider implements CodeLensProvider {
	async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
		let topOfDocument = new Range(0, 0, 0, 0)
			
		return [
			new CodeLens(topOfDocument, {
				command: 'extension.exportScript',
				title: 'Export to Script'
			}),
			new CodeLens(topOfDocument, {
				command: 'extension.addConsoleLog',
				title: 'Build Transaction'
			}),
			// new CodeLens(topOfDocument, {
			// 	command: 'extension.addConsoleLog',
			// 	title: 'Configure Variables'
			// })
		]	
	}
}

async function exportScript() {
	let { document } = window.activeTextEditor;
			
	const compiled = execute(document.getText().replace(/\s/g,''));

	if (compiled.error) {
		window.showErrorMessage('Compiler Error');
	} else {
		const newFile = Uri.parse('untitled:' + document.fileName.replace(".policy.miniscript", ".btc"));
		
		// Generate Bitcoin Script
		workspace.openTextDocument(newFile).then(document => {
			const edit = new WorkspaceEdit();
			edit.insert(newFile, new Position(0, 0), compiled.asmout);
			return workspace.applyEdit(edit).then(success => {
				if (success) {
					window.showTextDocument(document);
				} else {
					window.showInformationMessage('Error!');
				}
			});
		});
	}

}

export async function activate(context: ExtensionContext) {
	let commandDisposable = commands.registerCommand(
		'extension.exportScript',
		exportScript
	)
	
	context.subscriptions.push(commandDisposable)

	let docSelector = {
		language: 'miniscript.policy',
		scheme: 'file',
	};

	let codeLensProviderDisposable = languages.registerCodeLensProvider(
		docSelector,
		new MyCodeLensProvider()
	)
	
	context.subscriptions.push(codeLensProviderDisposable)
	
	context.subscriptions.push(
		commands.registerCommand('catCoding.start', () => {
			// Create and show panel
			const panel = window.createWebviewPanel(
				'catCoding',
				'Cat Coding',
				ViewColumn.One,
				{}
			);
	
			// And set its HTML content
			panel.webview.html = getWebviewContent();
		})
	);


	

	commands.registerCommand('miniscript.preview', async () => {
		let { document } = window.activeTextEditor;
		// get path-components, reverse it, and create a new uri
		// let say = document.uri.path;
		// console.log(say)
		// let newSay = "/Users/kevinkelbie/Desktop/test.miniscript";
		// let newUri = document.uri.with({ path: newSay });
		// await window.showTextDocument(newUri, { preview: true, viewColumn: 2 });
	});

	// console.log(document);

	languages.registerHoverProvider('btc', {
		provideHover: (doc: TextDocument, position, token) => {
			console.log("btc: provideHover")
			const range = doc.getWordRangeAtPosition(position); 
			
			let text = doc.getText();
			
			
			let word: string;
			// if (text.slice(range.start.character, range.end.character + 1).match(/[asctdvjnlu]:/)) {
			// 	word = text.slice(range.start.character, range.end.character + 1);
			// } else {
			// }
			word = doc.getText().split("\n")[range.start.line].slice(range.start.character, range.end.character)


			let description;
			let documentation;
			for (let i = 0; i < opcodes.length; i++) {
				if (opcodes[i].name == word) {
					description = opcodes[i].description;
					documentation = opcodes[i].documentation;
				}
			};

			const hover = [
				word, description, documentation
			];

			return new Hover(hover);
		}
		
	});

	workspace.onDidOpenTextDocument(event => {
		console.log("onDidOpenTextDocument");
		editor = window.activeTextEditor;
	});


	workspace.onWillSaveTextDocument(event => {
		console.log("onWillSaveTextDocument")
		switch (event.document.languageId) {
			case "btc":
				console.log("BTC SAVE");
				triggerUpdateDecorations(scriptToHex);
				break;
			case "minicript":
				break;
			case "miniscript.policy":
				console.log("MINISCRIPT SAVE");
				triggerUpdateDecorations(updateDecorations);
				break;
		}
	});

	workspace.onDidChangeTextDocument(event => {
		console.log("onDidChangeTextDocument")
		switch (event.document.languageId) {
			case "btc":
				console.log("BTC CHANGE");
				triggerUpdateDecorations(scriptToHex);
				break;
			case "minicript":
					break;
			case "miniscript.policy":
				console.log("MINISCRIPT CHANGE");
				triggerUpdateDecorations(updateDecorations);
				break;
		}
	});
	

	languages.registerHoverProvider('miniscript.policy', {
		provideHover: (doc: TextDocument, position, token) => {
			console.log(5);
			const range = doc.getWordRangeAtPosition(position); 
			let text = doc.getText();
			let word: string;

			word = doc.getText().split("\n")[range.start.line].slice(range.start.character, range.end.character)

			let description, documentation;
			switch(word) {
				case "pk":
					word = "pk(NAME)";
					description = "Require public key named NAME to sign. NAME can be any string up to 16 characters.";
					documentation = "";
					break;
				case "older":
					word = "older(NUM)"
					description = "Require that the nLockTime/nSequence value is at least NUM. NUM cannot be 0.";
					documentation = "";
					break;
				case "after":
					word = "after(NUM)";
					description = "Require that the nLockTime/nSequence value is at least NUM. NUM cannot be 0.";
					documentation = "";
					break;
				case "sha256":
					word = "sha256(HEX)";
					description = "Require that the preimage of 64-character HEX is revealed. The special value H can be used as HEX.";
					documentation = "";
					break;
				case "hash256":
					word = "hash256(HEX)";
					description = "Require that the preimage of 64-character HEX is revealed. The special value H can be used as HEX.";
					documentation = "";
					break;
				case "ripemd160":
					word = "ripemd160(HEX)";
					description = "Require that the preimage of 40-character HEX is revealed. The special value H can be used as HEX.";
					documentation = "";
					break;
				case "hash160":
					word = "hash160(HEX)";
					description = "Require that the preimage of 40-character HEX is revealed. The special value H can be used as HEX.";
					documentation = "";
					break;
				case "and":
					word = "and(POL,POL)";
					description = "Require that both subpolicies are satisfied.";
					documentation = "";
					break;
				case "or":
					word = "or([N@]POL,[N@]POL)";
					description = "Require that one of the subpolicies is satisfied. The numbers N indicate the relative probability of each of the subexpressions (so 9@ is 9 times more likely than the default).";
					documentation = "";
					break;
				case "thresh":
					word = "thresh(NUM,POL,POL,...)";
					description = "Require that NUM out of the following subpolicies are met (all combinations are assumed to be equally likely).";
					documentation = "";
					break;
			}

			const hover = [
				word, description, documentation
			];

			return new Hover(hover);
		}
	});

	let openCommand = commands.registerCommand("extension.helloWorld",
		async (fiddleId?: string, workspaceUri?: Uri) => {
			let { document } = window.activeTextEditor;
			
			const compiled = execute(document.getText().replace(/\s/g,''));

			const newFile = Uri.parse('untitled:' + document.fileName.replace(".policy.miniscript", ".btc"));
			
			// Generate Bitcoin Script
			workspace.openTextDocument(newFile).then(document => {
				const edit = new WorkspaceEdit();
				edit.insert(newFile, new Position(0, 0), compiled.asmout);
				return workspace.applyEdit(edit).then(success => {
					if (success) {
						window.showTextDocument(document);
					} else {
						window.showInformationMessage('Error!');
					}
				});
			});
		});

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'btc' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'languageServerExample',
		'Language Server Example',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
