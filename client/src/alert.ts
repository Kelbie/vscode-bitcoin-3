import { window } from "vscode";

export const alert = (message) => {
	window.showInformationMessage(message)
}