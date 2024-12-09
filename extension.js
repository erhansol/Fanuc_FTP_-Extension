const vscode = require('vscode');
const ftp = require('basic-ftp');
const path = require('path');

function activate(context) {
    // Command for uploading a file
    let uploadFileCommand = vscode.commands.registerCommand('extension.uploadFileToRobot', async (uri) => {
        await uploadToRobot(uri, false); // false indicates it's a single file
    });

    // Command for uploading a folder
    let uploadFolderCommand = vscode.commands.registerCommand('extension.uploadFolderToRobot', async (uri) => {
        await uploadToRobot(uri, true); // true indicates it's a folder
    });

    context.subscriptions.push(uploadFileCommand, uploadFolderCommand);
}

async function uploadToRobot(uri, isFolder) {
    const defaultIp = "192.168.10.124";
    const selectedIp = await vscode.window.showQuickPick(
        [
            { label: defaultIp, description: 'Default IP address' },
            { label: 'Other', description: 'Enter a custom IP address' }
        ],
        {
            placeHolder: 'Select the robot\'s IP address or choose "Other" to enter a custom IP.',
            canPickMany: false
        }
    );

    if (!selectedIp) {
        vscode.window.showErrorMessage('An IP address selection is required.');
        return;
    }

    let ipAddress = selectedIp.label;

    // Handle custom IP address input
    if (ipAddress === 'Other') {
        ipAddress = await vscode.window.showInputBox({
            prompt: "Enter the robot's IP address",
            placeHolder: "e.g., 192.168.1.100"
        });

        if (!ipAddress) {
            vscode.window.showErrorMessage('Custom IP address is required.');
            return;
        }
    }

    if (!uri || !uri.fsPath) {
        vscode.window.showErrorMessage('Please select a file or folder to upload.');
        return;
    }

    const selectedPath = uri.fsPath;

    try {
        const client = new ftp.Client();
        client.ftp.verbose = true;
        await client.access({
            host: ipAddress,
            user: "anonymous",
            password: "anonymous",
            secure: false
        });

        vscode.window.showInformationMessage('Connected to the robot.');

        console.log("Sending FTP commands...");

        // BYTE: Set binary mode
        await client.send("TYPE I");

        // Upload either a file or a folder based on `isFolder` flag
        if (isFolder) {
            const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(selectedPath));
            const lsFiles = files.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.LS'));

            for (const [fileName] of lsFiles) {
                const localPath = path.join(selectedPath, fileName);
                console.log(`Uploading file: ${fileName}`);
                await client.uploadFrom(localPath, fileName);
            }
        } else {
            // If it's a single .LS file
            console.log(`Uploading file: ${path.basename(selectedPath)}`);
            await client.uploadFrom(selectedPath, path.basename(selectedPath));
        }

        console.log("BYE: Closing connection.");
        client.close();

        vscode.window.showInformationMessage(`File(s) uploaded successfully to ${ipAddress}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
