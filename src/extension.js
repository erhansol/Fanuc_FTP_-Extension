const vscode = require('vscode');
const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser'); // Install csv-parser for reading CSV files

// Make the activate function async
async function activate(context) {
    // Command for uploading a file
    let uploadFileCommand = vscode.commands.registerCommand('extension.uploadFileToRobot', async (uri) => {
        await uploadToRobot(uri, false); // false indicates it's a single file
    });

    // Command for uploading a folder
    let uploadFolderCommand = vscode.commands.registerCommand('extension.uploadFolderToRobot', async (uri) => {
        await uploadToRobot(uri, true); // true indicates it's a folder
    });

    // Command for selecting CSV file
    let selectCSVFileCommand = vscode.commands.registerCommand('extension.selectCSVFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            console.log('No active editor found.');
            return;
        }

        // Allow the user to choose a CSV file
        const csvFilePath = await selectCSVFile();

        if (csvFilePath) {
            // Load descriptions from the selected CSV file
            descriptions = await loadDescriptions(csvFilePath);

            // Watch for changes in the selected CSV file
            watchCSVFile(csvFilePath);

            vscode.window.showInformationMessage(`Descriptions loaded from: ${csvFilePath}`);

            // Manually trigger an update of the inlay hints
            updateInlayHints();
        } else {
            vscode.window.showErrorMessage('No CSV file selected.');
        }
    });

    // Listen for the active text editor to ensure a document is open
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        console.log('No active editor found.');
        return;
    }

    // Load descriptions from the default CSV file located in the same folder as the document
    const directory = path.dirname(editor.document.uri.fsPath); // Get the directory of the current open document
    const defaultCSVPath = path.join(directory, 'descriptions.csv');
    descriptions = await loadDescriptions(defaultCSVPath);
    watchCSVFile(defaultCSVPath);

    // Register inlay hints provider
const provider = vscode.languages.registerInlayHintsProvider('*', {
    provideInlayHints(document, range, token) {
        const hints = [];
        const regex = /\bdo\[(\d+)\]/gi; // Matches DO[x] and captures the number inside [] (case-insensitive)

        // Iterate through each line in the document
        for (let lineNum = range.start.line; lineNum <= range.end.line; lineNum++) {
            const line = document.lineAt(lineNum);
            let match;

            // Match DO[x] patterns in the line (case-insensitive)
            while ((match = regex.exec(line.text.toLowerCase())) !== null) {
                const fullMatch = match[0]; // Full match like "DO[1]" or "do[1]"
                const matchStart = match.index;
                const matchEnd = matchStart + fullMatch.length;
                
                if (descriptions[fullMatch]) {
                    console.log('Hint loaded:', fullMatch);
                    // Position the hint just inside the closing bracket
                    const hintPosition = new vscode.Position(lineNum, matchEnd - 1);

                    // Create an inlay hint
                    hints.push(
                        new vscode.InlayHint(
                            hintPosition, // Position inside the closing bracket
                            ` ${descriptions[fullMatch]}`, // Hint content
                            vscode.InlayHintKind.Type // Type of hint
                        )
                    );
                }else{
                    console.log('Hint Not loaded:', fullMatch);
                }
            }
        }
        return hints;
    }
});

    // Add all commands and the inlay hint provider to the context subscriptions
    context.subscriptions.push(uploadFileCommand, uploadFolderCommand, selectCSVFileCommand, provider);
}

let descriptions = {}; // Store the descriptions

// Function to load descriptions from the CSV file
async function loadDescriptions(csvFilePath) {
    return new Promise((resolve, reject) => {
        const newDescriptions = {};

        // Check if the CSV file exists
        if (!fs.existsSync(csvFilePath)) {
            console.error(`CSV file not found at ${csvFilePath}`);
            return resolve(newDescriptions); // Return empty descriptions if file doesn't exist
        }

        // Read and parse the CSV file
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                //console.log('row.Key:', row.Key);
                //console.log('row.Description:', row.Description);
                
                if (row.Key && row.Description) {
                    newDescriptions[row.Key.toLowerCase()] = row.Description;
                    //console.log('newDescriptions: ', newDescriptions);
                    
                }
            })
            .on('end', () => {
                console.log('Descriptions loaded:', newDescriptions);
                resolve(newDescriptions);
            })
            .on('error', (err) => {
                console.error('Error reading CSV file:', err);
                reject(err);
            });
    });
}

// Watch for changes in the CSV file
function watchCSVFile(csvFilePath) {
    // Watch the CSV file for changes
    fs.watch(csvFilePath, { persistent: true }, async (eventType) => {
        if (eventType === 'change') {
            console.log('CSV file has been modified. Reloading data...');
            // Reload descriptions from the CSV file
            descriptions = await loadDescriptions(csvFilePath);
            vscode.window.showInformationMessage('CSV file updated. Descriptions reloaded.');

            // Manually trigger an update of the inlay hints
            updateInlayHints();
        }
    });
}

// Function to allow users to select a CSV file
async function selectCSVFile() {
    const selectedFileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        filters: {
            'CSV Files': ['csv']
        }
    });

    if (selectedFileUri && selectedFileUri.length > 0) {
        return selectedFileUri[0].fsPath;
    }

    return null; // No file selected
}

// Force an update of the inlay hints
function updateInlayHints() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        // This will force a re-calculation of inlay hints
        editor.document.save().then(() => {
            // After saving, the inlay hints should update automatically
            vscode.window.showInformationMessage('Inlay hints updated.');
        });
    }
}

//*****************************************************************
//* This COde Works*/
//*****************************************************************

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
