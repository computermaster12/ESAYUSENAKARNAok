const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected clients
const clients = {};
// Store command history
const commandHistory = {};
// Store active terminals
const terminals = {};

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  // Register client
  socket.on('register_client', (clientData) => {
    clients[socket.id] = {
      id: socket.id,
      name: clientData.name || `Client-${socket.id.substring(0, 5)}`,
      status: 'connected'
    };
    
    // Initialize command history for this client
    commandHistory[socket.id] = [];
    
    // Notify all clients about the updated client list
    io.emit('client_list_updated', Object.values(clients));
    console.log(`Client registered: ${clients[socket.id].name}`);
  });
  
  // Create new terminal
  socket.on('create_terminal', (terminalData) => {
    const terminalId = `terminal-${Date.now()}`;
    terminals[terminalId] = {
      id: terminalId,
      name: terminalData.name || `Terminal-${Object.keys(terminals).length + 1}`,
      createdAt: new Date(),
      commands: []
    };
    
    // Send terminal info back to client
    socket.emit('terminal_created', terminals[terminalId]);
    console.log(`Terminal created: ${terminals[terminalId].name}`);
  });
  
  // Rename terminal
  socket.on('rename_terminal', (data) => {
    if (terminals[data.terminalId]) {
      terminals[data.terminalId].name = data.name;
      socket.emit('terminal_renamed', terminals[data.terminalId]);
      console.log(`Terminal renamed: ${terminals[data.terminalId].name}`);
    }
  });
  
  // Execute command
  socket.on('execute_command', (commandData) => {
    console.log(`Command received: ${commandData.command}`);
    
    // Add command to history
    if (commandHistory[socket.id]) {
      commandHistory[socket.id].push({
        command: commandData.command,
        timestamp: new Date(),
        terminalId: commandData.terminalId
      });
    }
    
    // Add command to terminal
    if (terminals[commandData.terminalId]) {
      terminals[commandData.terminalId].commands.push({
        command: commandData.command,
        timestamp: new Date(),
        status: 'sent'
      });
    }
    
    // Forward command to all connected clients
    io.emit('command_to_execute', {
      command: commandData.command,
      terminalId: commandData.terminalId,
      sourceId: socket.id
    });
    
    // Acknowledge command receipt
    socket.emit('command_sent', {
      command: commandData.command,
      terminalId: commandData.terminalId,
      timestamp: new Date()
    });
  });
  
  // Command execution result
  socket.on('command_result', (resultData) => {
    console.log(`Command result received for: ${resultData.command}`);
    
    // Update terminal command status
    if (terminals[resultData.terminalId]) {
      const commandIndex = terminals[resultData.terminalId].commands.findIndex(
        cmd => cmd.command === resultData.command && cmd.status === 'sent'
      );
      
      if (commandIndex !== -1) {
        terminals[resultData.terminalId].commands[commandIndex].status = 'completed';
        terminals[resultData.terminalId].commands[commandIndex].result = resultData.result;
      }
    }
    
    // Forward result to all clients
    io.emit('command_result_received', {
      command: resultData.command,
      result: resultData.result,
      terminalId: resultData.terminalId,
      timestamp: new Date()
    });
  });
  
  // Stop command
  socket.on('stop_command', (commandData) => {
    console.log(`Stop command: ${commandData.command}`);
    
    // Forward stop request to all clients
    io.emit('stop_command_request', {
      command: commandData.command,
      terminalId: commandData.terminalId
    });
  });
  
  // Clear terminal
  socket.on('clear_terminal', (terminalData) => {
    if (terminals[terminalData.terminalId]) {
      terminals[terminalData.terminalId].commands = [];
      socket.emit('terminal_cleared', {
        terminalId: terminalData.terminalId
      });
      console.log(`Terminal cleared: ${terminals[terminalData.terminalId].name}`);
    }
  });
  
  // Close terminal
  socket.on('close_terminal', (terminalData) => {
    if (terminals[terminalData.terminalId]) {
      const terminalName = terminals[terminalData.terminalId].name;
      delete terminals[terminalData.terminalId];
      socket.emit('terminal_closed', {
        terminalId: terminalData.terminalId
      });
      console.log(`Terminal closed: ${terminalName}`);
    }
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (clients[socket.id]) {
      clients[socket.id].status = 'disconnected';
      io.emit('client_list_updated', Object.values(clients));
      
      // Keep command history but mark client as disconnected
      setTimeout(() => {
        if (clients[socket.id] && clients[socket.id].status === 'disconnected') {
          delete clients[socket.id];
          delete commandHistory[socket.id];
          io.emit('client_list_updated', Object.values(clients));
        }
      }, 60000); // Remove client after 1 minute if still disconnected
    }
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/clients', (req, res) => {
  res.json(Object.values(clients));
});

app.get('/api/terminals', (req, res) => {
  res.json(Object.values(terminals));
});

app.get('/api/history', (req, res) => {
  const allHistory = [];
  Object.keys(commandHistory).forEach(clientId => {
    commandHistory[clientId].forEach(cmd => {
      allHistory.push({
        ...cmd,
        clientId
      });
    });
  });
  res.json(allHistory);
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
