const vscode = require('vscode');
const ftp = require('basic-ftp');
const path = require('path'); // For handling file paths

function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.uploadToRobot', async (uri) => {
        // Default IP Address
        const defaultIp = "192.168.10.124";

        // Ask the user to select or enter an IP address
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

            // Connect to the FTP server
            await client.access({
                host: ipAddress,
                user: "anonymous", // Default username
                password: "anonymous", // Default password
                secure: false // Unencrypted FTP
            });

            vscode.window.showInformationMessage('Connected to the robot.');

            // Mimic the FTP commands
            console.log("Sending FTP commands...");

            // BYTE: Not needed for basic-ftp, handled automatically.
            console.log("BYTE: Command is skipped as it is automatic.");

            // PROMPT: Not supported directly, skipped.
            console.log("PROMPT: Skipping interactive prompt setting.");

            // Set Binary mode
            console.log("BINARY: Switching to binary mode.");
            await client.send("TYPE I");  // Ensure binary mode

            // Check if the selected path is a directory or a file
            const stats = await vscode.workspace.fs.stat(vscode.Uri.file(selectedPath));

            if (stats.type === vscode.FileType.Directory) {
                // If it's a directory, upload all .LS files inside it
                console.log(`MPUT *.LS: Uploading all .LS files from the directory.`);
                const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(selectedPath));
                const lsFiles = files.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.LS'));

                // Upload each .LS file
                for (const [fileName] of lsFiles) {
                    const localPath = path.join(selectedPath, fileName);
                    console.log(`Uploading file: ${fileName}`);
                    await client.uploadFrom(localPath, fileName);  // Upload the file
                }
            } else if (stats.type === vscode.FileType.File && selectedPath.endsWith('.LS')) {
                // If it's a file, upload the selected .LS file
                console.log(`MPUT ${path.basename(selectedPath)}: Uploading the selected .LS file.`);
                await client.uploadFrom(selectedPath, path.basename(selectedPath));  // Upload the selected file
            } else {
                vscode.window.showErrorMessage('Please select a valid .LS file or a directory containing .LS files.');
                return;
            }

            // BYE: Disconnect from the server
            console.log("BYE: Closing connection.");
            client.close();

            vscode.window.showInformationMessage(`File(s) uploaded successfully to ${ipAddress}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
