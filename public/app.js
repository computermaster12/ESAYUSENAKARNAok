// Global variables
let socket;
let currentTerminalId = null;
let terminals = [];
let connected = false;

// DOM Elements
const terminalContainer = document.querySelector('.terminal-container');
const newTerminalBtn = document.getElementById('newTerminalBtn');
const prevTerminalBtn = document.getElementById('prevTerminalBtn');
const nextTerminalBtn = document.getElementById('nextTerminalBtn');
const stopCommandBtn = document.getElementById('stopCommandBtn');
const clearTerminalBtn = document.getElementById('clearTerminalBtn');
const renameTerminalBtn = document.getElementById('renameTerminalBtn');
const closeTerminalBtn = document.getElementById('closeTerminalBtn');
const clientUrlInput = document.getElementById('clientUrlInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusIndicator = document.querySelector('.status-indicator');
const statusText = document.querySelector('.status-text');
const terminalTemplate = document.getElementById('terminal-template');

// Initialize the application
function init() {
    // Set up event listeners
    newTerminalBtn.addEventListener('click', createNewTerminal);
    prevTerminalBtn.addEventListener('click', showPreviousTerminal);
    nextTerminalBtn.addEventListener('click', showNextTerminal);
    stopCommandBtn.addEventListener('click', stopCurrentCommand);
    clearTerminalBtn.addEventListener('click', clearCurrentTerminal);
    renameTerminalBtn.addEventListener('click', renameCurrentTerminal);
    closeTerminalBtn.addEventListener('click', closeCurrentTerminal);
    connectBtn.addEventListener('click', connectToServer);
    disconnectBtn.addEventListener('click', disconnectFromServer);
    
    // Disable controls until connected
    toggleControlsEnabled(false);
}

// Connect to WebSocket server
function connectToServer() {
    const serverUrl = clientUrlInput.value;
    
    try {
        socket = io(serverUrl);
        
        // Socket event handlers
        socket.on('connect', () => {
            console.log('Connected to server');
            connected = true;
            updateConnectionStatus(true);
            toggleControlsEnabled(true);
            
            // Register as a client
            socket.emit('register_client', {
                name: 'Web Terminal'
            });
            
            // Create initial terminal
            createNewTerminal();
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            connected = false;
            updateConnectionStatus(false);
            toggleControlsEnabled(false);
        });
        
        socket.on('terminal_created', (terminalData) => {
            console.log('Terminal created:', terminalData);
            addTerminalToList(terminalData);
            showTerminal(terminalData.id);
        });
        
        socket.on('terminal_renamed', (terminalData) => {
            console.log('Terminal renamed:', terminalData);
            updateTerminalInList(terminalData);
        });
        
        socket.on('command_sent', (commandData) => {
            console.log('Command sent:', commandData);
        });
        
        socket.on('command_result_received', (resultData) => {
            console.log('Command result received:', resultData);
            appendCommandResult(resultData.terminalId, resultData.command, resultData.result);
        });
        
        socket.on('terminal_cleared', (data) => {
            console.log('Terminal cleared:', data);
            clearTerminalOutput(data.terminalId);
        });
        
        socket.on('terminal_closed', (data) => {
            console.log('Terminal closed:', data);
            removeTerminalFromList(data.terminalId);
            
            // Show another terminal if available
            if (terminals.length > 0) {
                showTerminal(terminals[0].id);
            } else {
                // Create a new terminal if none left
                createNewTerminal();
            }
        });
        
        socket.on('command_to_execute', (commandData) => {
            // This is handled by the client application, not the web interface
            console.log('Command to execute received:', commandData);
        });
        
        socket.on('stop_command_request', (commandData) => {
            // This is handled by the client application, not the web interface
            console.log('Stop command request received:', commandData);
        });
        
    } catch (error) {
        console.error('Connection error:', error);
        appendToTerminal(currentTerminalId, `Connection error: ${error.message}`, 'command-error');
    }
}

// Disconnect from WebSocket server
function disconnectFromServer() {
    if (socket) {
        socket.disconnect();
    }
}

// Update connection status UI
function updateConnectionStatus(isConnected) {
    if (isConnected) {
        statusIndicator.classList.remove('disconnected');
        statusIndicator.classList.add('connected');
        statusText.textContent = 'Connected';
    } else {
        statusIndicator.classList.remove('connected');
        statusIndicator.classList.add('disconnected');
        statusText.textContent = 'Disconnected';
    }
}

// Toggle controls enabled/disabled based on connection status
function toggleControlsEnabled(enabled) {
    newTerminalBtn.disabled = !enabled;
    prevTerminalBtn.disabled = !enabled;
    nextTerminalBtn.disabled = !enabled;
    stopCommandBtn.disabled = !enabled;
    clearTerminalBtn.disabled = !enabled;
    renameTerminalBtn.disabled = !enabled;
    closeTerminalBtn.disabled = !enabled;
    
    connectBtn.disabled = enabled;
    disconnectBtn.disabled = !enabled;
}

// Create a new terminal
function createNewTerminal() {
    if (!connected || !socket) return;
    
    const terminalName = `Terminal-${terminals.length + 1}`;
    socket.emit('create_terminal', { name: terminalName });
}

// Add terminal to the list
function addTerminalToList(terminalData) {
    terminals.push(terminalData);
    createTerminalElement(terminalData.id);
}

// Update terminal in the list
function updateTerminalInList(terminalData) {
    const index = terminals.findIndex(t => t.id === terminalData.id);
    if (index !== -1) {
        terminals[index] = terminalData;
    }
}

// Remove terminal from the list
function removeTerminalFromList(terminalId) {
    const index = terminals.findIndex(t => t.id === terminalId);
    if (index !== -1) {
        terminals.splice(index, 1);
        
        // Remove terminal element
        const terminalElement = document.querySelector(`.terminal-window[data-terminal-id="${terminalId}"]`);
        if (terminalElement) {
            terminalElement.remove();
        }
    }
}

// Create terminal DOM element
function createTerminalElement(terminalId) {
    const terminalClone = document.importNode(terminalTemplate.content, true);
    const terminalWindow = terminalClone.querySelector('.terminal-window');
    terminalWindow.dataset.terminalId = terminalId;
    
    const terminalInput = terminalWindow.querySelector('.terminal-input');
    terminalInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const command = terminalInput.value.trim();
            if (command) {
                executeCommand(terminalId, command);
                terminalInput.value = '';
            }
        }
    });
    
    terminalContainer.appendChild(terminalClone);
}

// Show a specific terminal
function showTerminal(terminalId) {
    // Hide all terminals
    const terminalWindows = document.querySelectorAll('.terminal-window');
    terminalWindows.forEach(terminal => {
        terminal.style.display = 'none';
    });
    
    // Show the selected terminal
    const selectedTerminal = document.querySelector(`.terminal-window[data-terminal-id="${terminalId}"]`);
    if (selectedTerminal) {
        selectedTerminal.style.display = 'flex';
        currentTerminalId = terminalId;
        
        // Focus the input
        const input = selectedTerminal.querySelector('.terminal-input');
        if (input) {
            input.focus();
        }
    }
}

// Show previous terminal
function showPreviousTerminal() {
    if (terminals.length <= 1) return;
    
    const currentIndex = terminals.findIndex(t => t.id === currentTerminalId);
    if (currentIndex > 0) {
        showTerminal(terminals[currentIndex - 1].id);
    } else {
        // Wrap around to the last terminal
        showTerminal(terminals[terminals.length - 1].id);
    }
}

// Show next terminal
function showNextTerminal() {
    if (terminals.length <= 1) return;
    
    const currentIndex = terminals.findIndex(t => t.id === currentTerminalId);
    if (currentIndex < terminals.length - 1) {
        showTerminal(terminals[currentIndex + 1].id);
    } else {
        // Wrap around to the first terminal
        showTerminal(terminals[0].id);
    }
}

// Execute command
function executeCommand(terminalId, command) {
    if (!connected || !socket) return;
    
    // Display command in terminal
    appendToTerminal(terminalId, `> ${command}`, 'command-input');
    
    // Send command to server
    socket.emit('execute_command', {
        command: command,
        terminalId: terminalId
    });
}

// Append text to terminal
function appendToTerminal(terminalId, text, className = '') {
    const terminal = document.querySelector(`.terminal-window[data-terminal-id="${terminalId}"]`);
    if (!terminal) return;
    
    const output = terminal.querySelector('.terminal-output');
    const line = document.createElement('div');
    line.className = `command-line ${className}`;
    line.textContent = text;
    output.appendChild(line);
    
    // Scroll to bottom
    output.scrollTop = output.scrollHeight;
}

// Append command result to terminal
function appendCommandResult(terminalId, command, result) {
    appendToTerminal(terminalId, result, 'command-output');
}

// Stop current command
function stopCurrentCommand() {
    if (!connected || !socket || !currentTerminalId) return;
    
    socket.emit('stop_command', {
        terminalId: currentTerminalId
    });
    
    appendToTerminal(currentTerminalId, 'Stopping command...', 'command-error');
}

// Clear current terminal
function clearCurrentTerminal() {
    if (!connected || !socket || !currentTerminalId) return;
    
    socket.emit('clear_terminal', {
        terminalId: currentTerminalId
    });
}

// Clear terminal output
function clearTerminalOutput(terminalId) {
    const terminal = document.querySelector(`.terminal-window[data-terminal-id="${terminalId}"]`);
    if (!terminal) return;
    
    const output = terminal.querySelector('.terminal-output');
    output.innerHTML = '';
}

// Rename current terminal
function renameCurrentTerminal() {
    if (!connected || !socket || !currentTerminalId) return;
    
    const terminal = terminals.find(t => t.id === currentTerminalId);
    if (!terminal) return;
    
    const newName = prompt('Enter new terminal name:', terminal.name);
    if (newName && newName.trim()) {
        socket.emit('rename_terminal', {
            terminalId: currentTerminalId,
            name: newName.trim()
        });
    }
}

// Close current terminal
function closeCurrentTerminal() {
    if (!connected || !socket || !currentTerminalId) return;
    
    if (terminals.length <= 1) {
        alert('Cannot close the last terminal. Create a new one first.');
        return;
    }
    
    if (confirm('Are you sure you want to close this terminal?')) {
        socket.emit('close_terminal', {
            terminalId: currentTerminalId
        });
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
