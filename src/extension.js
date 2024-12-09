const vscode = require('vscode');
const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser'); // Install csv-parser for reading CSV files


async function activate(context) {
    // Command for uploading a file
    let uploadFileCommand = vscode.commands.registerCommand('extension.uploadFileToRobot', async (uri) => {
        await uploadToRobot(uri, false); // false indicates it's a single file
    });

    // Command for uploading a folder
    let uploadFolderCommand = vscode.commands.registerCommand('extension.uploadFolderToRobot', async (uri) => {
        await uploadToRobot(uri, true); // true indicates it's a folder
    });

     // Listen for the active text editor to ensure a document is open
     const editor = vscode.window.activeTextEditor;
     if (!editor) {
         console.log('No active editor found.');
         return;
     }
 
     // Load descriptions from the CSV file in the same folder as the open document
     descriptions = await loadDescriptions(editor.document);
 
     // Watch for changes in the CSV file
     watchCSVFile(editor.document);
 
     // Register inlay hints provider
     const provider = vscode.languages.registerInlayHintsProvider('*', {
         provideInlayHints(document, range, token) {
             const hints = [];
             const regex = /\bDO\[(\d+)\]/g; // Matches DO[x] and captures the number inside []
 
             // Iterate through each line in the document
             for (let lineNum = range.start.line; lineNum <= range.end.line; lineNum++) {
                 const line = document.lineAt(lineNum);
                 let match;
 
                 // Match DO[x] patterns in the line
                 while ((match = regex.exec(line.text)) !== null) {
                     const fullMatch = match[0]; // Full match like "DO[1]"
                     const matchStart = match.index;
                     const matchEnd = matchStart + fullMatch.length;
 
                     if (descriptions[fullMatch]) {
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
                     }
                 }
             }
             return hints;
         }
     });

    context.subscriptions.push(uploadFileCommand, uploadFolderCommand,provider);
}

let descriptions = {}; // This will store the descriptions

function loadDescriptions(document) {
    return new Promise((resolve, reject) => {
        const newDescriptions = {};
        
        // Get the directory of the currently open document
        const csvFilePath = path.join(path.dirname(document.uri.fsPath), 'descriptions.csv');
        
        // Log the file path to ensure it's correct
        console.log(`Looking for CSV file at: ${csvFilePath}`);

        // Check if the file exists
        if (!fs.existsSync(csvFilePath)) {
            console.error(`CSV file not found at ${csvFilePath}`);
            return resolve(newDescriptions); // Return empty descriptions if file doesn't exist
        }

        // Read and parse the CSV file
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                // Log the row data to see what’s being read
                console.log('Row read from CSV:', row);

                if (row.Key && row.Description) {
                    newDescriptions[row.Key] = row.Description;
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

// Watch the file for changes
function watchCSVFile(document) {
    const csvFilePath = path.join(path.dirname(document.uri.fsPath), 'descriptions.csv');

    // Watch for changes to the CSV file
    fs.watch(csvFilePath, { persistent: true }, async (eventType) => {
        if (eventType === 'change') {
            console.log('CSV file has been modified. Reloading data...');
            // Reload descriptions from the CSV
            descriptions = await loadDescriptions(document);
        }
    });
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
