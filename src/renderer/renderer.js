const { ipcRenderer } = require('electron');

const drop = document.getElementById('drop');
const hiddenFile = document.getElementById('hiddenFile');
const chooseBtn = document.getElementById('chooseBtn');
const wmToggle = document.getElementById('wmToggle');
const presetSelect = document.getElementById('presetSelect');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

function setStatus(msg){ statusEl.textContent = msg || ''; }
function logLine(text){
  const ts = new Date().toTimeString().slice(0,8);
  logEl.textContent += `[${ts}] ${text}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function currentOpts(){
  return {
    watermark: !!wmToggle.checked,
    preset: presetSelect.value
  };
}

async function processPaths(paths){
  for(const p of paths){
    try{
      setStatus('Processing…');
      logLine(`→ Processing: ${p}`);
      const result = await ipcRenderer.invoke('process-file', p, currentOpts());
      logLine(`✓ Done ${JSON.stringify(result)}`);
    }catch(err){
      logLine(`✗ Error: ${err}`);
    }finally{
      setStatus('');
    }
  }
}

chooseBtn.addEventListener('click', ()=> hiddenFile.click());

hiddenFile.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []).map(f => f.path);
  if(files.length) await processPaths(files);
  hiddenFile.value = '';
});

['dragenter','dragover'].forEach(ev=>{
  drop.addEventListener(ev, (e)=>{ e.preventDefault(); drop.classList.add('hover'); });
});
['dragleave','drop'].forEach(ev=>{
  drop.addEventListener(ev, (e)=>{ e.preventDefault(); drop.classList.remove('hover'); });
});
drop.addEventListener('drop', async (e)=>{
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files || []).map(f => f.path);
  if(files.length) await processPaths(files);
});

// initial UI ping
setStatus('UI ready');

