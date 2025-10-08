const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { processFile } = require('../helpers/processor');

function createWindow(){
  const win = new BrowserWindow({
    width: 760, height: 540,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', ()=>{ if(process.platform !== 'darwin') app.quit(); });
app.on('activate', ()=>{ if(BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('process-file', async (_evt, filePath, opts)=>{
  return await processFile(filePath, opts, (msg)=>{
    // (optional) could forward progress back via IPC if you want live status
  });
});

