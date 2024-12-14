const vscode = require('vscode');
const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser'); // Install csv-parser for reading CSV files

const outputChannel = vscode.window.createOutputChannel("Robot File Sync");



// Make the activate function async
async function activate(context) {
    outputChannel.show();
    const downloadAll_Function = vscode.commands.registerCommand("extension.downloadAllFiles", async () => {
        // Prompt the user to select a folder
        const destinationFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Destination Folder"
        });

        if (!destinationFolder || destinationFolder.length === 0) {
            vscode.window.showErrorMessage("You must select a destination folder.");
            return;
        }

        const destinationUri = destinationFolder[0];
        //await f_downloadFromRobot(destinationUri, true, ".ls"); // Pass true for folder operations
        await f_downloadFromRobot(destinationUri, true, "*", "ALL"); // Pass true for folder operations
    });
    const downloadLs_Function = vscode.commands.registerCommand("extension.downloadLsFiles", async () => {
        // Prompt the user to select a folder
        const destinationFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Destination Folder"
        });

        if (!destinationFolder || destinationFolder.length === 0) {
            vscode.window.showErrorMessage("You must select a destination folder.");
            return;
        }

        const destinationUri = destinationFolder[0];
        await f_downloadFromRobot(destinationUri, true, ".ls", "LS"); // Pass true for folder operations
    });
    
    const updateLsFilesFromRobot_Function = vscode.commands.registerCommand("extension.updateFilesFromRobotLsFiles", async () => {
        await f_updateFilesFromRobot( true, ".ls", "LS"); // Pass true for folder operations
    });


    // Command for uploading a file
    let uploadFile_Function = vscode.commands.registerCommand('extension.uploadFileToRobot', async (uri) => {
        await f_uploadToRobot(uri, false); // false indicates it's a single file
    });

    // Command for uploading a folder
    let uploadFolder_Function = vscode.commands.registerCommand('extension.uploadFolderToRobot', async (uri) => {
        await f_uploadToRobot(uri, true); // true indicates it's a folder
    });

    // Command for selecting CSV file
    let selectCSVFile_Function = vscode.commands.registerCommand('extension.selectCSVFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            outputChannel.appendLine('No active editor found.');
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
        outputChannel.appendLine('No active editor found.');
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
        const regex = /\b(?:do|DI|R|F)\[(\d+)\]/gi;

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
                    outputChannel.appendLine('Hint loaded:' + fullMatch);
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
                    outputChannel.appendLine('Hint Not loaded:' + fullMatch);
                }
            }
        }
        return hints;
    }
    });

    const listLsFilesAndInsert_Function = vscode.commands.registerCommand(
        "extension.listLsFilesAndInsert",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage("No active editor found.");
                return;
            }
    
            // Get the directory of the currently open file
            const currentFilePath = editor.document.uri.fsPath;
            const currentDir = path.dirname(currentFilePath);
    
            // Get all `.ls` files in the same directory
            const lsFiles = fs.readdirSync(currentDir)
                .filter(file => file.endsWith('.ls'))
                .map(file => path.parse(file).name); // Strip the `.ls` extension

            if (lsFiles.length === 0) {
                 vscode.window.showInformationMessage("No .ls files found in the current directory.");
                return;
            }
    
            // Show the list of `.ls` files in a selection box
            const selectedFile = await vscode.window.showQuickPick(lsFiles, {
                placeHolder: "Select a .ls file to insert its name",
            });
    
            if (!selectedFile) {
                return; // User canceled the selection
            }
    
            // Insert the selected file name at the cursor position
            const cursorPosition = editor.selection.active;
            editor.edit((editBuilder) => {
                editBuilder.insert(cursorPosition, selectedFile);
            });
    
            vscode.window.showInformationMessage(`Inserted file name: ${selectedFile}`);
        }
    );
    
    // Add all commands and the inlay hint provider to the context subscriptions
    context.subscriptions.push( uploadFile_Function, 
                                uploadFolder_Function, 
                                selectCSVFile_Function, 
                                provider, 
                                downloadAll_Function, 
                                downloadLs_Function,
                                updateLsFilesFromRobot_Function,
                                listLsFilesAndInsert_Function);
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
                //outputChannel.appendLine('row.Key:', row.Key);
                //outputChannel.appendLine('row.Description:', row.Description);
                
                if (row.Key && row.Description) {
                    newDescriptions[row.Key.toLowerCase()] = row.Description;
                    //outputChannel.appendLine('newDescriptions: ', newDescriptions);
                    
                }
            })
            .on('end', () => {
                outputChannel.appendLine('Descriptions loaded:' + newDescriptions);
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
            outputChannel.appendLine('CSV file has been modified. Reloading data...');
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

async function f_uploadToRobot(uri, isFolder) {
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

        outputChannel.appendLine("Sending FTP commands...");

        // BYTE: Set binary mode
        await client.send("TYPE I");

        // Upload either a file or a folder based on `isFolder` flag
        if (isFolder) {
            const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(selectedPath));
            const lsFiles = files.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.LS'));

            for (const [fileName] of lsFiles) {
                const localPath = path.join(selectedPath, fileName);
                outputChannel.appendLine(`Uploading file: ${fileName}`);
                await client.uploadFrom(localPath, fileName);
            }
        } else {
            // If it's a single .LS file
            outputChannel.appendLine(`Uploading file: ${path.basename(selectedPath)}`);
            await client.uploadFrom(selectedPath, path.basename(selectedPath));
        }

        outputChannel.appendLine("BYE: Closing connection.");
        client.close();
        
        vscode.window.showInformationMessage(`File(s) uploaded successfully to ${ipAddress}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

async function f_downloadFromRobot(destinationUri, isFolder, fileType, saveType) {
    const defaultIp = "192.168.10.124";
    const selectedIp = await vscode.window.showQuickPick(
        [
            { label: defaultIp, description: "Default IP address" },
            { label: "Other", description: "Enter a custom IP address" }
        ],
        {
            placeHolder: 'Select the robot\'s IP address or choose "Other" to enter a custom IP.',
            canPickMany: false
        }
    );

    if (!selectedIp) {
        vscode.window.showErrorMessage("An IP address selection is required.");
        return;
    }

    let ipAddress = selectedIp.label;

    if (ipAddress === "Other") {
        ipAddress = await vscode.window.showInputBox({
            prompt: "Enter the robot's IP address",
            placeHolder: "e.g., 192.168.1.100"
        });

        if (!ipAddress) {
            vscode.window.showErrorMessage("Custom IP address is required.");
            return;
        }
    }

    const destinationPath = destinationUri.fsPath;

    // Create a subfolder labeled with today's date and handle existing folders
    const today = new Date();
    const baseFolderName = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`+ "-" + saveType;
    let counter = 1;
    let folderName = `${baseFolderName}_${String(counter).padStart(2, '0')}`;

    while (fs.existsSync(path.join(destinationPath, folderName))) {
        folderName = `${baseFolderName}_${String(counter).padStart(2, '0')}`;
        counter++;
    }

    const dateFolderPath = path.join(destinationPath, folderName );

    try {
        // Ensure the folder is created
        fs.mkdirSync(dateFolderPath, { recursive: true });

        const client = new ftp.Client();
        client.ftp.verbose = true;
        await client.access({
            host: ipAddress,
            user: "anonymous",
            password: "anonymous",
            secure: false
        });

        vscode.window.showInformationMessage("Connected to the robot.");

        outputChannel.appendLine("Fetching files from robot...");

        const fileList = await client.list();

        for (const file of fileList) {
            // If the wildcard "*" is passed, download all files, otherwise filter by extension
            if (file.isFile) {
                if (fileType === "*" || file.name.toLowerCase().endsWith(fileType.toLowerCase())) {
                    const localPath = path.join(dateFolderPath, file.name);

                    outputChannel.appendLine(`Downloading file: ${file.name}`);
                    await client.downloadTo(localPath, file.name);
                }
            }
        }
        
        outputChannel.appendLine("BYE: Closing connection.");
        client.close();

        vscode.window.showInformationMessage(`${fileType === "*" ? "All" : fileType} files downloaded successfully to ${dateFolderPath}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

async function f_updateFilesFromRobot(isFolder, fileType, saveType) {
    // Get the selected folder in the Explorer window
    const selectedFolders = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Select Folder to Save Files"
    });

    if (!selectedFolders || selectedFolders.length === 0) {
        vscode.window.showErrorMessage("Please select a folder from the Explorer or via the file picker.");
        return;
    }

    // Use the selected folder
    const destinationPath = selectedFolders[0].fsPath;

    const defaultIp = "192.168.10.124";
    const selectedIp = await vscode.window.showQuickPick(
        [
            { label: defaultIp, description: "Default IP address" },
            { label: "Other", description: "Enter a custom IP address" }
        ],
        {
            placeHolder: 'Select the robot\'s IP address or choose "Other" to enter a custom IP.',
            canPickMany: false
        }
    );

    if (!selectedIp) {
        vscode.window.showErrorMessage("An IP address selection is required.");
        return;
    }

    let ipAddress = selectedIp.label;

    if (ipAddress === "Other") {
        ipAddress = await vscode.window.showInputBox({
            prompt: "Enter the robot's IP address",
            placeHolder: "e.g., 192.168.1.100"
        });

        if (!ipAddress) {
            vscode.window.showErrorMessage("Custom IP address is required.");
            return;
        }
    }

    try {
        const client = new ftp.Client();
        client.ftp.verbose = true;
        await client.access({
            host: ipAddress,
            user: "anonymous",
            password: "anonymous",
            secure: false
        });

        vscode.window.showInformationMessage("Connected to the robot.");

        outputChannel.appendLine("Fetching files from robot...");
        outputChannel.appendLine("Fetching files from robot...");

        const fileList = await client.list();

        // Get the list of files already downloaded (existing in the local folder)
        const downloadedFiles = new Set();
        const existingFiles = fs.readdirSync(destinationPath);
        existingFiles.forEach(file => downloadedFiles.add(file.toLowerCase()));

        for (const file of fileList) {
            // If the wildcard "*" is passed, download all files, otherwise filter by extension
            if (file.isFile) {
                if (fileType === "*" || file.name.toLowerCase().endsWith(fileType.toLowerCase())) {
                    if (downloadedFiles.has(file.name.toLowerCase())) {
                        const localPath = path.join(destinationPath, file.name);
                        outputChannel.appendLine(`Updating file: ${file.name}`);
                        await client.downloadTo(localPath, file.name);
                        continue;
                    }else{
                        outputChannel.appendLine(`File Not in list, skipping: ${file.name}`);
                        continue;
                    }
                }
            }
        }

        outputChannel.appendLine("BYE: Closing connection.");
        client.close();

        vscode.window.showInformationMessage(`${fileType === "*" ? "All" : fileType} files downloaded successfully to ${destinationPath}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
